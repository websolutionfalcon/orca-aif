import { readFileSync } from 'node:fs'
import { assert, describe, test } from 'orca/testing'
import { resolveConfig } from './config.ts'
import type { DiscoveryResult } from './plans.ts'
import { buildStatus, installedAgentsOf, statusBarOf, summaryOf, type StatusInput } from './status.ts'
import type { WorkspaceRef } from './types.ts'

const workspace: WorkspaceRef = { id: 'w1', name: 'orca-aif', branch: 'feature/x', path: '/tmp/w', hostId: 'local' }
const none: DiscoveryResult = { plan: null, reason: 'none', candidates: [], integrityError: null }
const input = (overrides: Partial<StatusInput> = {}): StatusInput => ({
  workspace,
  installed: true,
  config: resolveConfig(null),
  artifacts: [],
  discovery: none,
  planText: null,
  roadmapText: null,
  installJson: null,
  warnings: [],
  ...overrides
})
const fullPlan: DiscoveryResult = {
  plan: { path: '.ai-factory/plans/feature-x.md', kind: 'full' },
  reason: 'branch',
  candidates: [],
  integrityError: null
}

describe('buildStatus', () => {
  test('not installed', () => {
    assert.equal(buildStatus(input({ installed: false })).kind, 'not-installed')
  })

  test('integrity error', () => {
    const status = buildStatus(input({ discovery: { ...none, integrityError: 'broken' } }))
    assert.deepEqual(status, { kind: 'error', workspace, message: 'broken' })
  })

  test('no plan', () => {
    assert.equal(buildStatus(input()).kind, 'no-plan')
  })

  test('ambiguous keeps candidates', () => {
    const status = buildStatus(input({ discovery: { plan: null, reason: 'ambiguous', candidates: ['a.md', 'b.md'], integrityError: null } }))
    assert.equal(status.kind, 'ambiguous')
    assert.ok(status.kind === 'ambiguous' && status.candidates.length === 2)
  })

  test('in progress and done', () => {
    const progress = buildStatus(input({ discovery: fullPlan, planText: '# P\n- [x] Task 1: a\n- [ ] Task 2: b\n' }))
    assert.equal(progress.kind, 'in-progress')
    const done = buildStatus(input({ discovery: fullPlan, planText: '# P\n- [x] Task 1: a\n' }))
    assert.equal(done.kind, 'done')
  })

  test('a plan without tasks is in progress, not done', () => {
    assert.equal(buildStatus(input({ discovery: fullPlan, planText: '# Empty plan\n' })).kind, 'in-progress')
  })

  test('an unreadable plan becomes no-plan with a warning', () => {
    const status = buildStatus(input({ discovery: fullPlan, planText: null }))
    assert.equal(status.kind, 'no-plan')
    assert.ok(status.kind === 'no-plan' && status.warnings.some((w) => w.includes('could not be read')))
  })

  test('config warnings are carried', () => {
    const status = buildStatus(input({ config: resolveConfig('git:\n  enabled: maybe\n') }))
    assert.ok(status.kind === 'no-plan' && status.warnings.length === 1)
  })
})

test('installed agents from .ai-factory.json', () => {
  assert.deepEqual(installedAgentsOf('{"agents":[{"id":"claude"},{"id":"codex"},{}]}'), ['claude', 'codex'])
  assert.deepEqual(installedAgentsOf('not json'), [])
  assert.deepEqual(installedAgentsOf(null), [])
})

describe('statusBarOf', () => {
  test('hidden without workspace or AI Factory', () => {
    assert.equal(statusBarOf({ kind: 'no-workspace' }).visible, false)
    assert.equal(statusBarOf({ kind: 'not-installed', workspace }).visible, false)
  })

  test('progress, done, ambiguous, error, remote', () => {
    const progress = statusBarOf(buildStatus(input({ discovery: fullPlan, planText: '- [x] Task 1: a\n- [ ] Task 2: b\n- [ ] Task 3: c\n' })))
    assert.deepEqual([progress.text, progress.tone], ['AIF 1/3', 'accent'])
    const done = statusBarOf(buildStatus(input({ discovery: fullPlan, planText: '- [x] Task 1: a\n' })))
    assert.deepEqual([done.text, done.tone], ['AIF ✓ 1/1', 'success'])
    assert.equal(statusBarOf(buildStatus(input({ discovery: { ...none, reason: 'ambiguous' } }))).tone, 'warning')
    assert.equal(statusBarOf({ kind: 'error', workspace, message: 'x' }).tone, 'danger')
    assert.equal(statusBarOf({ kind: 'remote', workspace }).icon, 'cloud')
  })

  test('tooltip in Russian with roadmap', () => {
    const bar = statusBarOf(buildStatus(input({ roadmapText: '- [ ] **Billing** — x\n' })), 'ru-RU')
    assert.match(bar.tooltip, /Нет активного плана/)
    assert.match(bar.tooltip, /Roadmap: 0\/1 milestones · Далее: Billing/)
  })
})

test('summary names the next task', () => {
  const text = summaryOf(buildStatus(input({ discovery: fullPlan, planText: '# Plan X\n- [x] Task 1: a\n- [ ] Task 2: write tests\n' })))
  assert.match(text, /Plan: Plan X \(full\) — 1\/2 tasks/)
  assert.match(text, /Next: Task 2: write tests/)
  assert.equal(summaryOf({ kind: 'no-workspace' }), 'No workspace is focused.')
})

test("end to end over this repository's .ai-factory/", () => {
  const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
  const config = resolveConfig(read('.ai-factory/config.yaml'))
  const status = buildStatus(
    input({
      config,
      discovery: { plan: { path: '.ai-factory/plans/feature-orca-aif-plugin.md', kind: 'full' }, reason: 'branch', candidates: [], integrityError: null },
      planText: read('.ai-factory/plans/feature-orca-aif-plugin.md'),
      roadmapText: read('.ai-factory/ROADMAP.md'),
      installJson: read('.ai-factory.json')
    })
  )
  assert.ok(status.kind === 'in-progress' || status.kind === 'done')
  assert.ok('plan' in status && status.plan?.total === 16)
  assert.ok('installedAgents' in status && status.installedAgents.includes('claude'))
  assert.equal(statusBarOf(status).visible, true)
})
