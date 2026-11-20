import { assert, test } from 'orca/testing'
import { AIF_COMMANDS, buildCommandText, MAX_ARGUMENT_LENGTH, prefixFor, sanitizeArgument } from './commands.ts'

test('prefix by agent, overridden by the setting', () => {
  assert.equal(prefixFor('claude'), '/')
  assert.equal(prefixFor('codex'), '$')
  assert.equal(prefixFor('Codex CLI'), '$')
  assert.equal(prefixFor(null), '/')
  assert.equal(prefixFor('codex', '/'), '/')
  assert.equal(prefixFor('claude', '$'), '$')
})

test('sanitize: one line, no control characters, bounded', () => {
  assert.equal(sanitizeArgument('  add\nsearch\r\nAPI  '), 'add search API')
  assert.equal(sanitizeArgument('evil\u001b[31mred\u0007; rm -rf'), 'evilred ; rm -rf')
  assert.equal(sanitizeArgument('\t\n'), undefined)
  assert.equal(sanitizeArgument(42), undefined)
  assert.equal(sanitizeArgument('x'.repeat(MAX_ARGUMENT_LENGTH + 50))?.length, MAX_ARGUMENT_LENGTH)
})

test('build: none ignores the argument, optional keeps it, required refuses without it', () => {
  assert.deepEqual(pick(buildCommandText('commit', '/', 'ignored')), '/aif-commit')
  assert.deepEqual(pick(buildCommandText('implement', '/', '5')), '/aif-implement 5')
  assert.deepEqual(pick(buildCommandText('implement', '$')), '$aif-implement')
  assert.deepEqual(pick(buildCommandText('plan', '/', 'full add\nsearch')), '/aif-plan full add search')
  const refused = buildCommandText('plan', '/', '   ')
  assert.equal(refused.ok, false)
  assert.equal(buildCommandText('rm', '/').ok, false)
  assert.equal(pick(buildCommandText('setup', '/')), '/aif')
})

test('every catalog id is unique and builds', () => {
  const ids = new Set(AIF_COMMANDS.map((command) => command.id))
  assert.equal(ids.size, AIF_COMMANDS.length)
  for (const command of AIF_COMMANDS) assert.equal(buildCommandText(command.id, '/', 'x').ok, true)
})


function pick(result: ReturnType<typeof buildCommandText>): string {
  return result.ok ? result.text : `ERROR ${result.error}`
}
