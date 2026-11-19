import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, assert, beforeEach, test } from 'orca/testing'
import type { StatusBarView } from '../core/status.ts'
import type { AifStatus } from '../core/types.ts'
import { createLogger } from './log.ts'
import type { ListedWorkspace, OrcaHost, WorkspaceContext } from './orcaHost.ts'
import { createStatusService, LAST_STATUS_KEY } from './statusService.ts'

let root = ''
let logs: string[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aif-status-'))
  logs = []
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const write = async (rel: string, text: string): Promise<void> => {
  await mkdir(join(root, rel, '..'), { recursive: true })
  await writeFile(join(root, rel), text)
}

function setup(options: { context?: WorkspaceContext; hostId?: string; notify?: boolean } = {}) {
  const bars: StatusBarView[] = []
  const notes: string[] = []
  const posts: AifStatus[] = []
  const store = new Map<string, unknown>()
  const context: WorkspaceContext =
    options.context === undefined ? { workspaceId: 'w1', branch: 'feature/auth', displayName: 'repo', terminals: [] } : options.context
  const workspaces: ListedWorkspace[] = [
    { id: 'w1', kind: 'worktree', name: 'repo', path: root, branch: 'feature/auth', hostId: options.hostId ?? 'local' }
  ]
  const host = {
    readContext: async () => context,
    listWorkspaces: async () => workspaces,
    updateStatusBar: async (view: StatusBarView) => void bars.push(view),
    notify: async (_title: string, body: string) => void notes.push(body)
  } as unknown as OrcaHost
  const service = createStatusService({
    host,
    log: createLogger({ log: (m: string) => logs.push(m) }, () => 'debug'),
    storage: { get: async (key) => store.get(key) ?? null, set: async (key, value) => void store.set(key, value) },
    post: (status) => posts.push(status),
    notifyOnPlanDone: () => options.notify ?? true
  })
  return { service, bars, notes, posts, store }
}

test('no workspace, then a plan in progress, then done with one notification', async () => {
  await write('.ai-factory/plans/feature-auth.md', '# Auth\n- [x] Task 1: a\n- [ ] Task 2: b\n')
  const { service, bars, notes, posts, store } = setup()

  const first = await service.refresh('test')
  assert.equal(first.kind, 'in-progress')
  assert.deepEqual([bars.at(-1)?.text, bars.at(-1)?.tone], ['AIF 1/2', 'accent'])
  assert.equal(posts.length, 1)
  assert.equal((store.get(LAST_STATUS_KEY) as AifStatus).kind, 'in-progress')

  await service.refresh('again')
  assert.equal(posts.length, 1, 'an unchanged status is not posted again')
  assert.equal(bars.length, 1)

  await write('.ai-factory/plans/feature-auth.md', '# Auth\n- [x] Task 1: a\n- [x] Task 2: b\n')
  const done = await service.refresh('poll')
  assert.equal(done.kind, 'done')
  assert.deepEqual(notes, ['Auth: All tasks are done.'])
  assert.ok(logs.some((line) => line.includes('INFO [aif:status] in-progress -> done')))
})

test('notification is off when the setting is off', async () => {
  await write('.ai-factory/plans/feature-auth.md', '- [ ] Task 1: a\n')
  const { service, notes } = setup({ notify: false })
  await service.refresh('a')
  await write('.ai-factory/plans/feature-auth.md', '- [x] Task 1: a\n')
  await service.refresh('b')
  assert.deepEqual(notes, [])
})

test('no focused workspace hides the status bar', async () => {
  const { service, bars } = setup({ context: null })
  const status = await service.refresh('test')
  assert.equal(status.kind, 'no-workspace')
  // The first refresh always applies, so the manifest's static "AIF" item is hidden.
  assert.deepEqual(bars.map((bar) => bar.visible), [false])
})

test('remote workspace', async () => {
  const { service } = setup({ hostId: 'ssh:box' })
  assert.equal((await service.refresh('test')).kind, 'remote')
})

test('not installed', async () => {
  const { service, bars } = setup()
  assert.equal((await service.refresh('test')).kind, 'not-installed')
  assert.equal(bars.at(-1)?.visible, false)
})

test('concurrent refreshes share one follow-up', async () => {
  await write('.ai-factory/PLAN.md', '- [ ] Task 1: a\n')
  const { service } = setup()
  const results = await Promise.all([service.refresh('1'), service.refresh('2'), service.refresh('3')])
  assert.ok(results.every((status) => status.kind === 'in-progress'))
  const refreshed = logs.filter((line) => line.startsWith('DEBUG [aif:status] refreshed')).length
  assert.equal(refreshed, 2)
})

test('regression: switching to another workspace whose plan at the same path is done does not notify', async () => {
  const other = await mkdtemp(join(tmpdir(), 'aif-status-b-'))
  try {
    await write('.ai-factory/PLAN.md', '- [ ] Task 1: a\n')
    await mkdir(join(other, '.ai-factory'), { recursive: true })
    await writeFile(join(other, '.ai-factory', 'PLAN.md'), '- [x] Task 1: a\n')
    const notes: string[] = []
    let context: WorkspaceContext = { workspaceId: 'w1', branch: 'main', displayName: 'a', terminals: [] }
    const host = {
      readContext: async () => context,
      listWorkspaces: async () => [
        { id: 'w1', kind: 'worktree', name: 'a', path: root, branch: 'main', hostId: 'local' },
        { id: 'w2', kind: 'worktree', name: 'b', path: other, branch: 'main', hostId: 'local' }
      ],
      updateStatusBar: async () => undefined,
      notify: async (_t: string, body: string) => void notes.push(body)
    } as unknown as OrcaHost
    const service = createStatusService({
      host,
      log: createLogger({ log: (m: string) => logs.push(m) }, () => 'debug'),
      storage: { get: async () => null, set: async () => undefined },
      post: () => undefined,
      notifyOnPlanDone: () => true
    })
    assert.equal((await service.refresh('a')).kind, 'in-progress')
    context = { workspaceId: 'w2', branch: 'main', displayName: 'b', terminals: [] }
    assert.equal((await service.refresh('switch')).kind, 'done')
    assert.deepEqual(notes, [])
  } finally {
    await rm(other, { recursive: true, force: true })
  }
})

test('regression: a throwing post does not break later refreshes', async () => {
  await write('.ai-factory/PLAN.md', '- [ ] Task 1: a\n')
  const host = {
    readContext: async () => ({ workspaceId: 'w1', branch: 'main', displayName: 'repo', terminals: [] }),
    listWorkspaces: async () => [{ id: 'w1', kind: 'worktree', name: 'repo', path: root, branch: 'main', hostId: 'local' }],
    updateStatusBar: async () => undefined,
    notify: async () => undefined
  } as unknown as OrcaHost
  let throwing = true
  const service = createStatusService({
    host,
    log: createLogger({ log: (m: string) => logs.push(m) }, () => 'debug'),
    storage: { get: async () => null, set: async () => undefined },
    post: () => {
      if (throwing) throw new Error('payload too large')
    },
    notifyOnPlanDone: () => true
  })
  const [first, second] = await Promise.all([service.refresh('1'), service.refresh('2')])
  assert.equal(first.kind, 'in-progress')
  assert.equal(second.kind, 'in-progress')
  throwing = false
  await write('.ai-factory/PLAN.md', '- [x] Task 1: a\n')
  const [third, fourth] = await Promise.all([service.refresh('3'), service.refresh('4')])
  assert.equal(third.kind, 'done')
  assert.equal(fourth.kind, 'done')
})

test('a plan finished while the worker was stopped still notifies after restoring the same workspace', async () => {
  await write('.ai-factory/plans/feature-auth.md', '# Auth\n- [x] Task 1: a\n')
  const { service, notes, store } = setup()
  store.set(LAST_STATUS_KEY, {
    kind: 'in-progress',
    workspace: { id: 'w1', name: 'repo', branch: 'feature/auth', path: root, hostId: 'local' },
    artifacts: [],
    plan: { path: '.ai-factory/plans/feature-auth.md', kind: 'full', title: 'Auth', branch: null, tasks: [], done: 0, total: 1, milestones: [], archived: false },
    planReason: 'branch',
    candidates: [],
    roadmap: null,
    installedAgents: [],
    warnings: []
  })
  assert.equal((await service.refresh('activate')).kind, 'done')
  assert.deepEqual(notes, ['Auth: All tasks are done.'])
})
