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

function setup(agents: ListedAgent[], overrides: Partial<Settings> = {}, accept = true) {
  const calls: Calls = { sent: [], launched: [], focused: [] }
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
    }
  } as unknown as OrcaHost
  const logs: string[] = []
  const service = createCommandService({
    host,
    log: createLogger({ log: (m: string) => logs.push(m) }, () => 'debug'),
    settings: () => ({ ...DEFAULT_SETTINGS, ...overrides }),
    workspaceId: async () => 'w1'
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
