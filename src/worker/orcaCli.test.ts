import { assert, test } from 'orca/testing'
import { openOwnPanel, parseCliOutput, pluginKeyFromLocation } from './orcaCli.ts'

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
