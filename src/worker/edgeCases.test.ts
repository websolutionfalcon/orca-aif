// End-to-end edge cases over a real temporary workspace: reading → discovery → status.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, assert, beforeEach, test } from 'orca/testing'
import { buildStatus, statusBarOf } from '../core/status.ts'
import type { StatusBarView } from '../core/status.ts'
import { createLogger } from './log.ts'
import type { OrcaHost, WorkspaceContext } from './orcaHost.ts'
import { createStatusService } from './statusService.ts'
import { fingerprintWorkspace, readWorkspace } from './workspaceFs.ts'

let root = ''
let logs: string[] = []
const log = () => createLogger({ log: (message: string) => logs.push(message) }, () => 'debug')
const write = async (rel: string, text: string | Uint8Array): Promise<void> => {
  await mkdir(join(root, rel, '..'), { recursive: true })
  await writeFile(join(root, rel), text)
}
const ref = (branch: string | null = 'feature/auth') => ({ id: 'w1', name: 'repo', branch, path: root, hostId: 'local' })
const statusOf = async (branch?: string | null) => buildStatus(await readWorkspace(ref(branch), log()))
const warnLines = () => logs.filter((line) => line.startsWith('WARN'))

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aif-edge-'))
  logs = []
  await mkdir(join(root, '.ai-factory'), { recursive: true })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test('a broken config.yaml falls back to defaults', async () => {
  await write('.ai-factory/config.yaml', new Uint8Array([0, 159, 146, 150, 10, 58, 58, 58, 123]))
  await write('.ai-factory/PLAN.md', '- [ ] Task 1: a\n')
  const status = await statusOf()
  assert.equal(status.kind, 'in-progress')
  assert.ok('plan' in status && status.plan?.kind === 'fast')
})

test('an empty plans/ folder and a plan without checkboxes: in progress 0/0, not done', async () => {
  await mkdir(join(root, '.ai-factory', 'plans'), { recursive: true })
  await write('.ai-factory/PLAN.md', '# Draft plan\n\nNothing yet.\n')
  const status = await statusOf()
  assert.equal(status.kind, 'in-progress')
  assert.equal(statusBarOf(status).text, 'AIF 0/0')
})

test('an ultra folder without the marker is ignored, two markers are an error', async () => {
  await write('.ai-factory/plans/notes/index.md', '# just notes\n- [ ] Task 1: x\n')
  await write('.ai-factory/plans/feature-other.md', '- [ ] Task 1: y\n')
  const single = await statusOf()
  assert.ok('plan' in single && single.plan?.path === '.ai-factory/plans/feature-other.md')

  await write('.ai-factory/plans/broken/index.md', '<!-- aif:plan-mode:ultra -->\n<!-- aif:plan-mode:ultra -->\n')
  const broken = await statusOf()
  assert.equal(broken.kind, 'error')
  assert.equal(statusBarOf(broken).tone, 'danger')
})

test('Windows separators in config paths', async () => {
  await write('.ai-factory/config.yaml', 'paths:\n  plans: .ai-factory\\work\\\n')
  await write('.ai-factory/work/feature-auth.md', '- [x] Task 1: a\n')
  const status = await statusOf()
  assert.equal(status.kind, 'done')
})

test('CRLF plan files', async () => {
  await write('.ai-factory/plans/feature-auth.md', '# CRLF\r\n- [x] Task 1: a\r\n- [ ] Task 2: b\r\n')
  const status = await statusOf()
  assert.ok('plan' in status && status.plan?.total === 2 && status.plan.title === 'CRLF')
})

test('a repeated problem is logged once; polling logs nothing', async () => {
  await write('.ai-factory/config.yaml', 'paths:\n  roadmap: ../../outside.md\ngit:\n  enabled: maybe\n')
  await statusOf()
  await statusOf()
  await statusOf()
  assert.equal(warnLines().length, 2, warnLines().join('\n'))
  const before = logs.length
  await fingerprintWorkspace(root, log())
  await fingerprintWorkspace(root, log())
  assert.equal(logs.length, before)
})

test('switching branches switches the plan', async () => {
  await write('.ai-factory/plans/feature-auth.md', '- [ ] Task 1: a\n')
  await write('.ai-factory/plans/feature-billing.md', '- [x] Task 1: b\n')
  let context: WorkspaceContext = { workspaceId: 'w1', branch: 'feature/auth', displayName: 'repo', terminals: [] }
  const bars: StatusBarView[] = []
  const host = {
    readContext: async () => context,
    listWorkspaces: async () => [{ id: 'w1', kind: 'worktree', name: 'repo', path: root, branch: context?.branch ?? null, hostId: 'local' }],
    updateStatusBar: async (view: StatusBarView) => void bars.push(view),
    notify: async () => undefined
  } as unknown as OrcaHost
  const service = createStatusService({
    host,
    log: log(),
    storage: { get: async () => null, set: async () => undefined },
    post: () => undefined,
    notifyOnPlanDone: () => true
  })
  assert.equal((await service.refresh('a')).kind, 'in-progress')
  context = { workspaceId: 'w1', branch: 'feature/billing', displayName: 'repo', terminals: [] }
  const switched = await service.refresh('event:workspace.changed')
  assert.equal(switched.kind, 'done')
  assert.equal(bars.at(-1)?.text, 'AIF ✓ 1/1')
})
