import { readFileSync } from 'node:fs'
import { assert, describe, test } from 'orca/testing'
import { resolveConfig } from './config.ts'
import { countUltraMarkers, discoverPlan, parsePlan, type PlansDirEntry } from './plans.ts'

const fixture = (name: string): string =>
  readFileSync(new URL(`../../test/fixtures/plans/${name}`, import.meta.url), 'utf8')

describe('parsePlan', () => {
  test('classic full plan: tasks, phases, branch, milestones, code fences skipped', () => {
    const plan = parsePlan(fixture('full-classic.md'), '.ai-factory/plans/x.md', 'full')
    assert.equal(plan.title, 'Implementation Plan: User Authentication')
    assert.equal(plan.branch, 'feature/user-authentication')
    assert.equal(plan.total, 4)
    assert.equal(plan.done, 1)
    assert.deepEqual(plan.tasks[2], {
      id: 3,
      title: 'Implement registration',
      done: true,
      isCommit: false,
      phase: 'Phase 2: Implementation'
    })
    assert.equal(plan.tasks[0].phase, 'Phase 1: Setup')
    assert.deepEqual(plan.milestones, ['Auth', 'Sessions, cookies'])
    assert.equal(plan.archived, false)
  })

  test('task-based plan: commit marker and uppercase X', () => {
    const plan = parsePlan(fixture('full-task-based.md'), 'p.md', 'full')
    assert.equal(plan.done, 2)
    assert.equal(plan.total, 3)
    assert.equal(plan.tasks[2].isCommit, true)
    assert.equal(plan.tasks[2].title, 'Commit changes with message "feat: add invoice model"')
  })

  test('localized headings: only numbered tasks count', () => {
    const plan = parsePlan(fixture('localized.md'), 'p.md', 'full')
    assert.equal(plan.total, 2)
    assert.equal(plan.done, 1)
    assert.equal(plan.tasks[0].phase, 'Фаза 1: Каркас')
  })

  test('plans without task numbers count every checkbox', () => {
    const plan = parsePlan(fixture('unnumbered.md'), 'PLAN.md', 'fast')
    assert.equal(plan.total, 2)
    assert.equal(plan.tasks[0].id, null)
  })

  test('ultra index: details links stripped, Definition of Done ignored', () => {
    const text = fixture('ultra-bundle/index.md')
    assert.equal(countUltraMarkers(text), 1)
    const plan = parsePlan(text, 'plans/b/index.md', 'ultra')
    assert.equal(plan.total, 2)
    assert.equal(plan.tasks[0].title, 'Ledger entity')
    assert.equal(plan.tasks[1].title, 'Ledger repository')
  })

  test('archived frontmatter', () => {
    assert.equal(parsePlan(fixture('archived.md'), 'a.md', 'full').archived, true)
  })

  test('the plan of this repository parses', () => {
    const text = readFileSync(
      new URL('../../.ai-factory/plans/feature-orca-aif-plugin.md', import.meta.url),
      'utf8'
    )
    const plan = parsePlan(text, '.ai-factory/plans/feature-orca-aif-plugin.md', 'full')
    assert.equal(plan.total, 16)
    assert.equal(plan.branch, 'feature/orca-aif-plugin')
    assert.equal(plan.milestones.length, 9)
  })
})

describe('discoverPlan', () => {
  const slug = resolveConfig(null)
  const sequential = resolveConfig('workflow:\n  plan_id_format: sequential\n')
  const base = { fastPlanExists: false, fixPlanExists: false }
  const file = (name: string): PlansDirEntry => ({ name, isDir: false })
  const dir = (name: string, ultraMarkers?: number): PlansDirEntry => ({ name, isDir: true, ultraMarkers })

  test('branch full plan wins over other named plans', () => {
    const result = discoverPlan({
      ...base,
      branch: 'feature/auth',
      config: slug,
      entries: [file('feature-auth.md'), file('other.md')]
    })
    assert.deepEqual(result.plan, { path: '.ai-factory/plans/feature-auth.md', kind: 'full' })
    assert.equal(result.reason, 'branch')
  })

  test('branch ultra bundle is preferred over a full file with the same stem', () => {
    const result = discoverPlan({
      ...base,
      branch: 'feature/auth',
      config: slug,
      entries: [file('feature-auth.md'), dir('feature-auth', 1)]
    })
    assert.deepEqual(result.plan, { path: '.ai-factory/plans/feature-auth/index.md', kind: 'ultra' })
  })

  test('a directory without the marker is not a plan', () => {
    const result = discoverPlan({ ...base, branch: 'feature/auth', config: slug, entries: [dir('feature-auth', 0), dir('assets')] })
    assert.equal(result.plan, null)
    assert.equal(result.reason, 'none')
  })

  test('sequential: highest prefix, ultra on a tie', () => {
    const result = discoverPlan({
      ...base,
      branch: 'feature/auth',
      config: sequential,
      entries: [file('0001_feature-auth.md'), file('0003_feature-auth.md'), dir('0003_feature-auth', 1), file('0002_other.md')]
    })
    assert.deepEqual(result.plan, { path: '.ai-factory/plans/0003_feature-auth/index.md', kind: 'ultra' })
  })

  test('single named plan when the branch has none', () => {
    const result = discoverPlan({ ...base, branch: 'main', config: slug, entries: [file('feature-x.md'), file('notes.txt')] })
    assert.deepEqual(result.plan, { path: '.ai-factory/plans/feature-x.md', kind: 'full' })
    assert.equal(result.reason, 'single-named')
  })

  test('several named plans are ambiguous', () => {
    const result = discoverPlan({ ...base, branch: 'main', config: slug, entries: [file('b.md'), dir('a', 1)] })
    assert.equal(result.plan, null)
    assert.equal(result.reason, 'ambiguous')
    assert.deepEqual(result.candidates, ['.ai-factory/plans/a/index.md', '.ai-factory/plans/b.md'])
  })

  test('PLAN.md and FIX_PLAN.md inside plans/ are not named plans', () => {
    const config = resolveConfig('paths:\n  plan: .ai-factory/plans/PLAN.md\n  fix_plan: .ai-factory/plans/FIX_PLAN.md\n')
    const result = discoverPlan({
      branch: null,
      config,
      entries: [file('PLAN.md'), file('FIX_PLAN.md')],
      fastPlanExists: true,
      fixPlanExists: true
    })
    assert.deepEqual(result.plan, { path: '.ai-factory/plans/PLAN.md', kind: 'fast' })
  })

  test('fast plan, then fix plan', () => {
    assert.equal(discoverPlan({ ...base, branch: null, config: slug, entries: [], fastPlanExists: true }).reason, 'fast')
    const fix = discoverPlan({ ...base, branch: null, config: slug, entries: [], fixPlanExists: true })
    assert.deepEqual(fix.plan, { path: '.ai-factory/FIX_PLAN.md', kind: 'fix' })
  })

  test('git disabled skips the branch step', () => {
    const config = resolveConfig('git:\n  enabled: false\n')
    const result = discoverPlan({ ...base, branch: 'feature/auth', config, entries: [file('feature-auth.md'), file('b.md')] })
    assert.equal(result.reason, 'ambiguous')
  })

  test('a bundle with two markers is an integrity error', () => {
    const result = discoverPlan({ ...base, branch: 'main', config: slug, entries: [dir('broken', 2)] })
    assert.match(result.integrityError ?? '', /2 ultra markers/)
  })

  test('an archive nested in plans/ is excluded', () => {
    const config = resolveConfig('paths:\n  archive: .ai-factory/plans/archive/\n')
    const result = discoverPlan({ ...base, branch: 'main', config, entries: [dir('archive'), file('one.md')] })
    assert.equal(result.reason, 'single-named')
  })
})
