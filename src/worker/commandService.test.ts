import { assert, describe, test } from 'orca/testing'
import { createCommandService, pickAgent } from './commandService.ts'
import { createLogger } from './log.ts'
import type { ListedAgent, OrcaHost } from './orcaHost.ts'
import { DEFAULT_SETTINGS, type Settings } from './settings.ts'

interface Calls {
  sent: { terminalId: string; text: string; enter: boolean }[]
  launched: { workspaceId: string; agent: string; prompt?: string }[]
  focused: string[]
}

function setup(
  agents: ListedAgent[],
  overrides: Partial<Settings> = {},
  accept = true,
  waitForIdle?: (terminalId: string) => Promise<void>
) {
  const calls: Calls & { notes: string[] } = { sent: [], launched: [], focused: [], notes: [] }
  const host = {
    listAgents: async () => agents,
    sendText: async (terminalId: string, text: string, enter: boolean) => {
      calls.sent.push({ terminalId, text, enter })
      return accept
    },
    launchAgent: async (workspaceId: string, agent: string, prompt?: string) => {
      calls.launched.push({ workspaceId, agent, prompt })
      return 'term-new'
    },
    focusTerminal: async (terminalId: string) => {
      calls.focused.push(terminalId)
      return true
    },
    notify: async (_title: string, body: string) => void calls.notes.push(body)
  } as unknown as OrcaHost
  const logs: string[] = []
  const service = createCommandService({
    host,
    log: createLogger({ log: (m: string) => logs.push(m) }, () => 'debug'),
    settings: () => ({ ...DEFAULT_SETTINGS, ...overrides }),
    workspaceId: async () => 'w1',
    waitForIdle
  })
  return { service, calls, logs }
}

const claude: ListedAgent = { terminalId: 't1', title: 'Claude', agent: 'claude', state: 'waiting', stateStartedAt: 1 }
const codex: ListedAgent = { terminalId: 't2', title: 'Codex', agent: 'codex', state: 'waiting', stateStartedAt: 1 }

describe('combinations', () => {
  test('running agent + argument → sent with Enter', async () => {
    const { service, calls, logs } = setup([claude])
    const result = await service.run({ command: 'plan', argument: 'full add search', source: 'panel' })
    assert.deepEqual(result, { ok: true, action: 'sent', terminalId: 't1', text: '/aif-plan full add search' })
    assert.deepEqual(calls.sent, [{ terminalId: 't1', text: '/aif-plan full add search', enter: true }])
    assert.ok(!logs.some((line) => line.includes('add search')), 'the argument text is never logged')
  })

  test('no agent → launched with the prompt', async () => {
    const { service, calls } = setup([])
    const result = await service.run({ command: 'implement', source: 'palette' })
    assert.deepEqual(result, { ok: true, action: 'launched', terminalId: 'term-new', text: '/aif-implement' })
    assert.deepEqual(calls.launched, [{ workspaceId: 'w1', agent: 'claude', prompt: '/aif-implement' }])
  })

  test('running agent + required argument missing from the palette → typed without Enter and focused', async () => {
    const { service, calls } = setup([codex])
    const result = await service.run({ command: 'fix', source: 'palette' })
    assert.deepEqual(result, { ok: true, action: 'typed', terminalId: 't2', text: '$aif-fix ' })
    assert.deepEqual(calls.sent, [{ terminalId: 't2', text: '$aif-fix ', enter: false }])
    assert.deepEqual(calls.focused, ['t2'])
  })

  test('required argument missing with no agent → refused, nothing launched', async () => {
    const { service, calls } = setup([])
    const result = await service.run({ command: 'plan', source: 'palette' })
    assert.equal(result.ok, false)
    assert.deepEqual(calls.launched, [])
  })

  test('required argument missing from the panel → refused even with an agent', async () => {
    const { service, calls } = setup([claude])
    assert.equal((await service.run({ command: 'plan', argument: ' ', source: 'panel' })).ok, false)
    assert.deepEqual(calls.sent, [])
  })
})

test('always-launch ignores the running agent', async () => {
  const { service, calls } = setup([claude], { sendMode: 'always-launch', defaultAgent: 'codex' })
  const result = await service.run({ command: 'verify', source: 'panel' })
  assert.deepEqual(result, { ok: true, action: 'launched', terminalId: 'term-new', text: '$aif-verify' })
  assert.deepEqual(calls.sent, [])
})

test('prefix setting overrides the agent', async () => {
  const { service } = setup([codex], { commandPrefix: '/' })
  const result = await service.run({ command: 'commit', source: 'panel' })
  assert.ok(result.ok && result.text === '/aif-commit')
})

test('unknown command and refused text', async () => {
  assert.equal((await setup([claude]).service.run({ command: 'rm -rf', source: 'panel' })).ok, false)
  assert.equal((await setup([claude], {}, false).service.run({ command: 'commit', source: 'panel' })).ok, false)
})

test('pickAgent prefers idle agents with a terminal', () => {
  const busy: ListedAgent = { ...claude, terminalId: 'busy', state: 'working' }
  const headless: ListedAgent = { ...claude, terminalId: null, state: 'waiting' }
  assert.equal(pickAgent([busy, headless, codex])?.terminalId, 't2')
  assert.equal(pickAgent([headless]), null)
})

describe('regressions (review)', () => {
  test('never types into an agent blocked on a permission prompt', async () => {
    const blocked: ListedAgent = { ...claude, terminalId: 'tb', state: 'blocked' }
    const { service, calls } = setup([blocked])
    const sent = await service.run({ command: 'verify', source: 'panel' })
    assert.equal(sent.ok, false)
    const typed = await service.run({ command: 'fix', source: 'palette' })
    assert.equal(typed.ok, false)
    assert.deepEqual(calls.sent, [])
    assert.deepEqual(calls.launched, [])
  })

  test('a blocked agent is skipped when another agent is usable', async () => {
    const blocked: ListedAgent = { ...claude, terminalId: 'tb', state: 'blocked' }
    const busy: ListedAgent = { ...codex, terminalId: 'tw', state: 'working' }
    const { service, calls } = setup([blocked, busy])
    const result = await service.run({ command: 'verify', source: 'panel' })
    assert.ok(result.ok && result.terminalId === 'tw')
    assert.equal(calls.sent[0].terminalId, 'tw')
  })
})

describe('regressions (background launch)', () => {
  test('a launched agent terminal is shown, not left in the background', async () => {
    const { service, calls } = setup([])
    const result = await service.run({ command: 'rules', source: 'panel' })
    assert.ok(result.ok && result.action === 'launched')
    assert.deepEqual(calls.focused, ['term-new'])
  })

  test('a second click while the agent is still starting does not launch another one', async () => {
    const { service, calls } = setup([])
    await service.run({ command: 'rules', source: 'panel' })
    const again = await service.run({ command: 'rules', source: 'panel' })
    assert.equal(calls.launched.length, 1)
    assert.equal(again.ok, false)
    assert.match(again.ok ? '' : again.error, /starting/)
    assert.deepEqual(calls.focused, ['term-new', 'term-new'])
  })
})

describe('regressions (launch prompt lost)', () => {
  test('launches without a prompt, waits for the agent to be idle, then types the command', async () => {
    let release: () => void = () => undefined
    const idle = new Promise<void>((done) => (release = done))
    const { service, calls } = setup([], {}, true, () => idle)
    const result = await service.run({ command: 'rules', source: 'panel' })
    assert.deepEqual(result, { ok: true, action: 'launched', terminalId: 'term-new', text: '/aif-rules' })
    assert.deepEqual(calls.launched, [{ workspaceId: 'w1', agent: 'claude', prompt: undefined }])
    assert.deepEqual(calls.sent, [], 'nothing is typed before the agent is ready')
    release()
    await service.settled()
    assert.deepEqual(calls.sent, [{ terminalId: 'term-new', text: '/aif-rules', enter: true }])
  })

  test('when the agent never gets idle, the user is told to type the command', async () => {
    const { service, calls } = setup([], {}, true, async () => {
      throw new Error('timeout')
    })
    await service.run({ command: 'rules', source: 'panel' })
    await service.settled()
    assert.deepEqual(calls.sent, [])
    assert.equal(calls.notes.length, 1)
    assert.match(calls.notes[0], /\/aif-rules/)
  })
})
