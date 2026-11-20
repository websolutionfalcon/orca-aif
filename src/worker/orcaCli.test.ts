import { assert, test } from 'orca/testing'
import { launchAgentTab, openOwnPanel, parseCliOutput, parseLaunch, pluginKeyFromLocation, terminalShows } from './orcaCli.ts'

test('plugin key from where the worker lives', () => {
  assert.equal(
    pluginKeyFromLocation('file:///Users/me/Library/Application%20Support/orca/plugins/websolutionfalcon.ai-factory/9f2c/src/worker.ts'),
    'websolutionfalcon.ai-factory'
  )
  assert.equal(pluginKeyFromLocation('file:///Users/me/Projects/orca-aif/src/worker.ts'), 'local.ai-factory')
  assert.equal(pluginKeyFromLocation('file:///C:/Users/me/AppData/Roaming/orca/plugins/acme.ai-factory/1/src/worker.ts'), 'acme.ai-factory')
})

test('opens its own panel tab through the CLI', async () => {
  const calls: (readonly string[])[] = []
  await openOwnPanel(async (args) => void calls.push(args), 'local.ai-factory')
  assert.deepEqual(calls, [['plugin', 'open', 'local.ai-factory', '--panel', 'aif']])
})

test('CLI output parsing', () => {
  assert.deepEqual(parseCliOutput('{"ok":true,"result":{"shown":true}}'), { shown: true })
  assert.throws(() => parseCliOutput('{"ok":false,"error":{"message":"no_workspace"}}'), /no_workspace/)
  assert.throws(() => parseCliOutput('nope'), /JSON/)
})

test('launch output: chat or terminal with its handle', () => {
  assert.deepEqual(parseLaunch({ outcome: { kind: 'chat' }, receipt: { detail: 'Chat is your choice' } }), { surface: 'chat', terminalId: null })
  assert.deepEqual(parseLaunch({ outcome: { kind: 'terminal', terminal: { handle: 'term_91cec0e5-46d1-440a' } } }), {
    surface: 'terminal',
    terminalId: 'term_91cec0e5-46d1-440a'
  })
})

test('launch goes through `orca agent launch` with the workspace path, focus and an optional prompt', async () => {
  const calls: (readonly string[])[] = []
  await launchAgentTab(async (args) => {
    calls.push(args)
    return { outcome: { kind: 'chat' } }
  }, { agent: 'claude', workspacePath: '/work/repo', prompt: '/aif-rules' })
  assert.deepEqual(calls[0], ['agent', 'launch', '--agent', 'claude', '--worktree', 'path:/work/repo', '--focus', '--prompt', '/aif-rules'])
})

test('terminal screen check', async () => {
  const run = async () => ({ terminal: { screen: ['❯ /aif-rules', 'Working…'] } })
  assert.equal(await terminalShows(run, 'term_x', '/aif-rules'), true)
  assert.equal(await terminalShows(run, 'term_x', '/aif-plan'), false)
})
