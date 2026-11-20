import { readFileSync } from 'node:fs'
import { assert, test } from 'orca/testing'
import { DEFAULT_PATHS, parseYamlMappings, resolveConfig } from './config.ts'

test('a missing config.yaml gives every default', () => {
  const config = resolveConfig(null)
  assert.deepEqual(config.paths, DEFAULT_PATHS)
  assert.equal(config.git.enabled, true)
  assert.equal(config.git.createBranches, true)
  assert.equal(config.git.branchPrefix, 'feature/')
  assert.equal(config.planIdFormat, 'slug')
  assert.deepEqual(config.warnings, [])
})

test('reads nested mappings, quotes and comments', () => {
  const yaml = parseYamlMappings(
    [
      '# top comment',
      'language:',
      '  ui: ru  # inline',
      "  artifacts: 'en'",
      'paths:',
      '  plans: "custom/plans/"',
      '  # nested comment',
      '  plan: ./custom/PLAN.md',
      'warmup:',
      '  paths: []',
      '  list:',
      '    - a',
      'git:',
      '  enabled: false'
    ].join('\n')
  )
  assert.deepEqual(yaml, {
    language: { ui: 'ru', artifacts: 'en' },
    paths: { plans: 'custom/plans/', plan: './custom/PLAN.md' },
    warmup: { paths: '[]', list: {} },
    git: { enabled: 'false' }
  })
})

test('custom paths are normalized, unsafe ones fall back with a warning', () => {
  const config = resolveConfig(
    [
      'paths:',
      '  plans: .\\work\\plans\\',
      '  plan: ./work/PLAN.md',
      '  roadmap: ../outside/ROADMAP.md',
      '  fix_plan: /etc/FIX_PLAN.md',
      'workflow:',
      '  plan_id_format: sequential'
    ].join('\n')
  )
  assert.equal(config.paths.plans, 'work/plans/')
  assert.equal(config.paths.plan, 'work/PLAN.md')
  assert.equal(config.paths.roadmap, DEFAULT_PATHS.roadmap)
  assert.equal(config.paths.fixPlan, DEFAULT_PATHS.fixPlan)
  assert.equal(config.planIdFormat, 'sequential')
  assert.equal(config.warnings.length, 2)
})

test('garbage values fall back to defaults with warnings', () => {
  const config = resolveConfig(
    ['git:', '  enabled: maybe', '  create_branches: no', 'workflow:', '  plan_id_format: weird', 'not yaml at all {'].join(
      '\n'
    )
  )
  assert.equal(config.git.enabled, true)
  assert.equal(config.git.createBranches, true)
  assert.equal(config.planIdFormat, 'slug')
  assert.equal(config.warnings.length, 3)
})

test('reserved plan_id_format values behave like slug without a warning', () => {
  const config = resolveConfig('workflow:\n  plan_id_format: uuid\n')
  assert.equal(config.planIdFormat, 'slug')
  assert.deepEqual(config.warnings, [])
})

test('a real config.yaml written by /aif (snapshot of this repository)', () => {
  const text = readFileSync(new URL('../../test/fixtures/sample-project/config.yaml', import.meta.url), 'utf8')
  const config = resolveConfig(text)
  assert.deepEqual(config.paths, DEFAULT_PATHS)
  assert.equal(config.artifactsLanguage, 'ru')
  assert.equal(config.git.createBranches, true)
  assert.equal(config.git.baseBranch, 'main')
  assert.deepEqual(config.warnings, [])
})
