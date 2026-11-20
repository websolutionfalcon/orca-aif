import { assert, test } from 'orca/testing'
import { INITIAL_STATE, reduce } from './state.ts'

test('loaded, pending, done and failure', () => {
  let state = reduce(INITIAL_STATE, { type: 'loaded', status: { kind: 'no-workspace' }, commands: [] })
  assert.equal(state.loading, false)
  state = reduce(state, { type: 'pending', command: 'plan' })
  assert.equal(state.pending, 'plan')
  state = reduce(state, { type: 'commandDone', action: 'sent', text: '/aif-plan x', lead: 'Sent' })
  assert.deepEqual([state.pending, state.notice], [null, { kind: 'ok', lead: 'Sent', detail: '/aif-plan x' }])
  state = reduce(state, { type: 'failed', lead: 'Failed', message: 'timeout' })
  assert.equal(state.notice?.kind, 'error')
  assert.equal(reduce(state, { type: 'dismiss' }).notice, null)
})

test('a new command clears the previous notice', () => {
  const state = reduce({ ...INITIAL_STATE, notice: { kind: 'error', lead: 'x', detail: 'y' } }, { type: 'pending', command: 'fix' })
  assert.equal(state.notice, null)
})

test('a status.changed payload replaces both status and command buttons', () => {
  const before = reduce(INITIAL_STATE, {
    type: 'loaded',
    status: { kind: 'no-workspace' },
    commands: [{ id: 'plan', label: '/aif-plan', title: 'Plan', arg: 'required', argHint: '' }]
  })
  const after = reduce(before, {
    type: 'loaded',
    status: { kind: 'no-workspace' },
    commands: [{ id: 'plan', label: '$aif-plan', title: 'Plan', arg: 'required', argHint: '' }]
  })
  assert.equal(after.commands[0].label, '$aif-plan')
})

test('refreshing ends when a status or a failure arrives', () => {
  const busy = reduce(INITIAL_STATE, { type: 'refreshing' })
  assert.equal(busy.refreshing, true)
  assert.equal(reduce(busy, { type: 'status', status: { kind: 'no-workspace' } }).refreshing, false)
  assert.equal(reduce(busy, { type: 'failed', lead: 'x', message: 'y' }).refreshing, false)
})
