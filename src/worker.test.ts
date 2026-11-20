// Runs src/worker.ts's activate(orca) over Orca's mock host and a temporary workspace folder.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, assert, beforeEach, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aif-worker-'))
  await mkdir(join(root, '.ai-factory', 'plans'), { recursive: true })
  await writeFile(join(root, '.ai-factory', 'plans', 'feature-auth.md'), '# Auth\n- [x] Task 1: a\n- [ ] Task 2: b\n')
  await writeFile(join(root, '.ai-factory', 'ROADMAP.md'), '- [ ] **Auth** — x\n')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function host(agents: unknown[] = []) {
  return mockHost({
    results: {
      'workspace.readContext': { workspaceId: 'w1', branch: 'feature/auth', displayName: 'repo', terminals: [] },
      'workspace.list': {
        workspaces: [{ id: 'w1', kind: 'worktree', name: 'repo', path: root, branch: 'feature/auth', hostId: 'local' }],
        truncated: false
      },
      'agents.list': { agents },
      'statusBar.update': { ok: true },
      'terminal.sendText': { accepted: true },
      'agent.launch': { terminalId: 'term-new' },
      'editor.open': { opened: true },
      'commands.run': { ran: true }
    }
  })
}

test('registers commands, answers the panel and updates the status bar', async () => {
  const worker = await mountWorker(main, { host: host() })
  try {
    const summary = await worker.command('aif.summary')
    assert.equal(typeof summary, 'string')
    assert.match(String(summary), /1\/2/)

    const answer = await worker.request('status.get')
    assert.ok(answer.ok)
    assert.ok(answer.ok && answer.status.kind === 'in-progress')
    assert.ok(answer.ok && answer.commands.some((command) => command.id === 'plan' && command.label === '/aif-plan'))

    const bars = worker.host.callsOf('statusBar.update')
    assert.ok(bars.length >= 1)
    assert.deepEqual((bars.at(-1) as { text: string }).text, 'AIF 1/2')
    assert.ok(worker.posts.some((post) => post.event === 'status.changed'))
    assert.ok(worker.logs.some((line) => line.includes('activated v')))
    assert.deepEqual(worker.refusals, [])
  } finally {
    await worker.deactivate()
  }
})

test('command.run launches an agent when none runs', async () => {
  const worker = await mountWorker(main, { host: host() })
  try {
    const result = await worker.request('command.run', { command: 'implement' })
    assert.deepEqual(result, { ok: true, action: 'launched', terminalId: 'term-new', text: '/aif-implement' })
    assert.deepEqual(worker.host.callsOf('agent.launch').at(-1), { workspaceId: 'w1', agent: 'claude', prompt: '/aif-implement' })
  } finally {
    await worker.deactivate()
  }
})

test('palette command types into a running agent', async () => {
  const worker = await mountWorker(main, {
    host: host([{ terminalId: 't1', title: 'Claude', agent: 'claude', state: 'waiting', stateStartedAt: 1 }])
  })
  try {
    const result = await worker.command('aif.run.verify')
    assert.equal(result, '/aif-verify → sent')
    assert.deepEqual(worker.host.callsOf('terminal.sendText').at(-1), { terminalId: 't1', text: '/aif-verify', enter: true })
  } finally {
    await worker.deactivate()
  }
})

test('file.open only opens paths the status lists', async () => {
  const worker = await mountWorker(main, { host: host() })
  try {
    await worker.request('status.get')
    const opened = await worker.request('file.open', { path: '.ai-factory/plans/feature-auth.md' })
    assert.deepEqual(opened, { ok: true, path: '.ai-factory/plans/feature-auth.md' })
    const refused = await worker.request('file.open', { path: '../../etc/passwd' })
    assert.equal(refused.ok, false)
    assert.equal(worker.host.callsOf('editor.open').length, 1)
  } finally {
    await worker.deactivate()
  }
})

test('events refresh the status', async () => {
  const worker = await mountWorker(main, { host: host() })
  try {
    await worker.request('status.get')
    await writeFile(join(root, '.ai-factory', 'plans', 'feature-auth.md'), '# Auth\n- [x] Task 1: a\n- [x] Task 2: b\n')
    await worker.emit('workspace.changed', { context: { workspaceId: 'w1', branch: 'feature/auth', displayName: 'repo', terminals: [] } })
    const answer = await worker.request('status.get')
    assert.ok(answer.ok && answer.status.kind === 'done')
  } finally {
    await worker.deactivate()
  }
})

test('regression: panel commands follow the running agent and travel with status.changed', async () => {
  const worker = await mountWorker(main, {
    host: host([{ terminalId: 't2', title: 'Codex', agent: 'codex', state: 'waiting', stateStartedAt: 1 }])
  })
  try {
    const answer = await worker.request('status.get')
    assert.ok(answer.ok && answer.commands.find((command) => command.id === 'plan')?.label === '$aif-plan')
    const post = worker.posts.find((entry) => entry.event === 'status.changed')
    const payload = post?.payload as { status?: { kind: string }; commands?: { label: string }[] } | undefined
    assert.equal(payload?.status?.kind, 'in-progress')
    assert.ok(payload?.commands?.some((command) => command.label === '$aif-plan'))
  } finally {
    await worker.deactivate()
  }
})

test('always-launch labels buttons with the default agent prefix, not the running agent', async () => {
  const worker = await mountWorker(main, {
    host: mockHost({
      settings: { sendMode: 'always-launch', defaultAgent: 'codex' },
      results: {
        'workspace.readContext': { workspaceId: 'w1', branch: 'feature/auth', displayName: 'repo', terminals: [] },
        'workspace.list': {
          workspaces: [{ id: 'w1', kind: 'worktree', name: 'repo', path: root, branch: 'feature/auth', hostId: 'local' }],
          truncated: false
        },
        'agents.list': { agents: [{ terminalId: 't1', title: 'Claude', agent: 'claude', state: 'waiting', stateStartedAt: 1 }] },
        'statusBar.update': { ok: true }
      }
    })
  })
  try {
    const answer = await worker.request('status.get')
    assert.ok(answer.ok && answer.commands.every((command) => command.label.startsWith('$')))
  } finally {
    await worker.deactivate()
  }
})

test('regression: clicking the status bar item opens the right sidebar instead of silently returning text', async () => {
  const worker = await mountWorker(main, { host: host() })
  try {
    await worker.command('aif.statusClick')
    assert.deepEqual(worker.host.callsOf('commands.run').at(-1), { action: 'sidebar.right.toggle' })
    assert.ok(worker.logs.some((line) => line.includes('status bar clicked')))
  } finally {
    await worker.deactivate()
  }
})
