import { assert, test } from 'orca/testing'
import { commandRunInput } from './requests.ts'

// Orca validates plugin.request input as JSON: an `undefined` field is refused with
// `invalid_params: input: Invalid input`, so an absent argument must be left out entirely.
test('regression: no argument means no argument key at all', () => {
  const input = commandRunInput('rules', undefined)
  assert.deepEqual(input, { command: 'rules' })
  assert.equal(Object.prototype.hasOwnProperty.call(input, 'argument'), false)
  assert.equal(JSON.stringify(commandRunInput('rules', '   ')), '{"command":"rules"}')
})

test('a typed argument is trimmed and kept', () => {
  assert.deepEqual(commandRunInput('plan', '  full add search '), { command: 'plan', argument: 'full add search' })
})

test('draft flag is sent only when set', () => {
  assert.deepEqual(commandRunInput('plan', undefined, true), { command: 'plan', draft: true })
  assert.deepEqual(commandRunInput('plan', undefined, false), { command: 'plan' })
})
