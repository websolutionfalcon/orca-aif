import { assert, describe, test } from 'orca/testing'
import type { AifStatus, ReadyStatus } from '../core/types.ts'
import type { PanelCommand } from '../protocol.ts'
import { byClass, byKey, findAll, textOf } from './dom.ts'
import { panelTexts } from './i18n.ts'
import { INITIAL_STATE, type PanelState } from './state.ts'
import { view, type ViewHandlers } from './view.ts'

const workspace = { id: 'w1', name: 'repo', branch: 'feature/auth', path: '/r', hostId: 'local' }
const ready: ReadyStatus = {
  workspace,
  artifacts: [
    { key: 'config', path: '.ai-factory/config.yaml', exists: true },
    { key: 'architecture', path: '.ai-factory/ARCHITECTURE.md', exists: false }
  ],
  plan: {
    path: '.ai-factory/plans/feature-auth.md',
    kind: 'full',
    title: 'Auth plan',
    branch: 'feature/auth',
    tasks: [
      { id: 1, title: 'Model', done: true, isCommit: false, phase: 'Phase 1' },
      { id: 2, title: 'Service', done: false, isCommit: false, phase: 'Phase 1' },
      { id: 3, title: 'Commit', done: false, isCommit: true, phase: 'Phase 2' }
    ],
    done: 1,
    total: 3,
    milestones: [],
    archived: false
  },
  planReason: 'branch',
  candidates: [],
  roadmap: {
    path: '.ai-factory/ROADMAP.md',
    milestones: [
      { name: 'Catalog', description: 'product pages', done: true },
      { name: 'Auth', description: 'login and sessions', done: false }
    ],
    done: 0,
    total: 1,
    next: null
  },
  installedAgents: ['claude'],
  skills: [
    { name: 'aif-commit', description: 'Create conventional commit messages by analyzing staged changes.', argumentHint: '[scope]', path: '.claude/skills/aif-commit/SKILL.md' },
    { name: 'aif-plan', description: 'Plan a feature or task in fast, full, or ultra mode.', argumentHint: '[fast | full | ultra] <description>', path: '.claude/skills/aif-plan/SKILL.md' },
    { name: 'aif-review', description: 'Perform code review on staged changes or a pull request.', argumentHint: null, path: '.claude/skills/aif-review/SKILL.md' }
  ],
  warnings: ['plan too large']
}
const commands: PanelCommand[] = [
  { id: 'explore', label: '/aif-explore', title: 'Explore', arg: 'optional', argHint: 'topic' },
  { id: 'roadmap', label: '/aif-roadmap', title: 'Roadmap', arg: 'optional', argHint: '' },
  { id: 'plan', label: '/aif-plan', title: 'Plan', arg: 'required', argHint: 'description' },
  { id: 'commit', label: '/aif-commit', title: 'Commit', arg: 'none', argHint: '' },
  { id: 'architecture', label: '/aif-architecture', title: 'Architecture', arg: 'optional', argHint: '' },
  { id: 'rules', label: '/aif-rules', title: 'Rules', arg: 'optional', argHint: '' }
]

function handlers(): ViewHandlers & { opened: string[]; ran: string[]; drafted: string[] } {
  const opened: string[] = []
  const ran: string[] = []
  const drafted: string[] = []
  return {
    opened,
    ran,
    drafted,
    draft: (command, argument) => drafted.push(argument ? `${command.id}:${argument}` : command.id),
    refresh: () => undefined,
    run: (command) => ran.push(command.id),
    open: (path) => opened.push(path),
    dismiss: () => undefined,
    toggleDone: () => undefined,
    toggleContext: () => undefined,
    skillsSearch: () => undefined,
    toggleSkills: () => undefined,
    argInput: () => undefined,
    argValue: () => 'typed'
  }
}

const state = (status: AifStatus, extra: Partial<PanelState> = {}): PanelState => ({
  ...INITIAL_STATE,
  loading: false,
  status,
  commands,
  ...extra
})
const en = panelTexts('en-US')

describe('every status kind renders', () => {
  const kinds: AifStatus[] = [
    { kind: 'no-workspace' },
    { kind: 'remote', workspace },
    { kind: 'not-installed', workspace },
    { kind: 'error', workspace, message: 'two markers' },
    { kind: 'no-plan', ...ready, plan: null },
    { kind: 'ambiguous', ...ready, plan: null, candidates: ['a.md', 'b.md'] },
    { kind: 'in-progress', ...ready },
    { kind: 'done', ...ready }
  ]
  for (const status of kinds) {
    test(status.kind, () => {
      const tree = view(state(status), en, handlers())
      assert.ok(textOf(tree).includes('AI Factory'))
    })
  }
})

test('plan shows progress, phases, next task and commit task', () => {
  const tree = view(state({ kind: 'in-progress', ...ready }), en, handlers())
  const text = textOf(tree)
  assert.match(text, /1\/3 tasks/)
  assert.match(text, /Completed \(1\)/)
  assert.ok(!text.includes('1. Model'), 'done tasks are folded by default')
  assert.match(text, /Phase 1/)
  assert.equal(findAll(tree, byClass('next')).length, 1)
  assert.equal(findAll(tree, byClass('commit')).length, 1)
  assert.match(text, /plan too large/)
})

test('artifacts link existing files, the missing one is plain text', () => {
  const h = handlers()
  const tree = view(state({ kind: 'in-progress', ...ready }, { contextOpen: true }), en, h)
  const links = findAll(tree, byClass('link'))
  links.find((link) => link.attrs.title === '.ai-factory/config.yaml')?.on.click(new Event('click'))
  assert.deepEqual(h.opened, ['.ai-factory/config.yaml'])
  assert.ok(!links.some((link) => link.attrs.title === '.ai-factory/ARCHITECTURE.md'))
  assert.match(textOf(tree), /Architecture — missing/)
})

test('the ready panel shows plan, roadmap and context only: no command or agent cards', () => {
  const tree = view(state({ kind: 'in-progress', ...ready }), en, handlers())
  const titles = findAll(tree, (node) => node.tag === 'h2').map((node) => textOf(node))
  assert.deepEqual(titles, ['Plan', 'Roadmap', 'Context', 'Warnings', 'Skills library'])
  assert.equal(findAll(tree, (node) => (node.attrs['data-key'] ?? '').startsWith('run:')).length, 0)
})

test('not installed: the set up button takes an optional argument and is disabled while pending', () => {
  const h = handlers()
  const idle = view(state({ kind: 'not-installed', workspace }, { commands: [] }), en, h)
  assert.equal(findAll(idle, byKey('arg:setup'))[0]?.attrs.value, 'typed')
  findAll(idle, byKey('run:setup'))[0].on.click(new Event('click'))
  assert.deepEqual(h.ran, ['setup'])
  const busy = view(state({ kind: 'not-installed', workspace }, { commands: [], pending: 'setup' }), en, h)
  assert.equal(findAll(busy, byKey('run:setup'))[0].attrs.disabled, '')
})

test('not installed offers set up only; Russian texts', () => {
  const tree = view(state({ kind: 'not-installed', workspace }, { commands: [] }), panelTexts('ru'), handlers())
  assert.match(textOf(tree), /AI Factory не настроен/)
  assert.equal(findAll(tree, byKey('run:setup')).length, 1)
})

test('error notice is an alert', () => {
  const tree = view(state({ kind: 'no-workspace' }, { notice: { kind: 'error', lead: 'Failed', detail: 'timeout' } }), en, handlers())
  assert.equal(findAll(tree, (node) => node.attrs.role === 'alert').length, 1)
})

test('completed tasks unfold, code ticks are stripped', () => {
  const status: AifStatus = {
    kind: 'in-progress',
    ...ready,
    plan: { ...ready.plan!, tasks: [...ready.plan!.tasks, { id: 4, title: 'Run `orca plugin test`', done: false, isCommit: false, phase: null }] }
  }
  const text = textOf(view(state(status, { showDone: true }), en, handlers()))
  assert.match(text, /1\. Model/)
  assert.match(text, /4\. Run orca plugin test/)
})

test('workspace name equal to the branch is shown once', () => {
  const same = { ...workspace, name: 'feature/auth' }
  const tree = view(state({ kind: 'remote', workspace: same }), en, handlers())
  assert.ok(!textOf(tree).includes('feature/auth · feature/auth'))
})

test('plan and roadmap open their files from the title links, with no separate Open buttons', () => {
  const h = handlers()
  const tree = view(state({ kind: 'in-progress', ...ready }), en, h)
  assert.equal(findAll(tree, (node) => (node.attrs['data-key'] ?? '').startsWith('open:')).length, 0)
  findAll(tree, (node) => node.attrs.title === '.ai-factory/plans/feature-auth.md')[0].on.click(new Event('click'))
  findAll(tree, (node) => node.attrs.title === '.ai-factory/ROADMAP.md')[0].on.click(new Event('click'))
  assert.deepEqual(h.opened, ['.ai-factory/plans/feature-auth.md', '.ai-factory/ROADMAP.md'])
})

describe('skills library', () => {
  const skillNames = (tree: ReturnType<typeof view>) =>
    findAll(tree, (node) => (node.attrs['data-key'] ?? '').startsWith('skill:')).map((node) => node.attrs['data-key'].slice(6))

  test('collapsed by default with a search field and the total', () => {
    const tree = view(state({ kind: 'in-progress', ...ready }), en, handlers())
    assert.equal(findAll(tree, byKey('skills:search')).length, 1)
    assert.match(textOf(findAll(tree, byKey('skills:toggle'))[0]), /▸ All skills \(3\)/)
    assert.deepEqual(skillNames(tree), [])
  })

  test('the spoiler unfolds every skill', () => {
    const tree = view(state({ kind: 'in-progress', ...ready }, { skillsOpen: true }), en, handlers())
    assert.deepEqual(skillNames(tree), ['aif-commit', 'aif-plan', 'aif-review'])
  })

  test('a query unfolds the list and matches names and descriptions', () => {
    const byName = view(state({ kind: 'in-progress', ...ready }, { skillsQuery: 'plan' }), en, handlers())
    assert.deepEqual(skillNames(byName), ['aif-plan'])
    assert.match(textOf(findAll(byName, byKey('skills:toggle'))[0]), /Found: 1 \/ 3/)
    const byDescription = view(state({ kind: 'in-progress', ...ready }, { skillsQuery: 'STAGED changes' }), en, handlers())
    assert.deepEqual(skillNames(byDescription), ['aif-commit', 'aif-review'])
    const none = view(state({ kind: 'in-progress', ...ready }, { skillsQuery: 'kubernetes' }), panelTexts('ru'), handlers())
    assert.match(textOf(none), /Ничего не найдено/)
  })

  test('a skill name opens its SKILL.md', () => {
    const h = handlers()
    const tree = view(state({ kind: 'in-progress', ...ready }, { skillsOpen: true }), en, h)
    findAll(tree, (node) => node.attrs.title === '.claude/skills/aif-plan/SKILL.md')[0].on.click(new Event('click'))
    assert.deepEqual(h.opened, ['.claude/skills/aif-plan/SKILL.md'])
  })
})

test('refresh is a compact icon button with an accessible label, spinning while it runs', () => {
  const idle = findAll(view(state({ kind: 'no-workspace' }), en, handlers()), byKey('refresh'))[0]
  assert.equal(idle.attrs.class, 'icon-btn')
  assert.equal(idle.attrs['aria-label'], 'Refresh')
  assert.equal(textOf(idle), '')
  assert.equal((idle.children[0] as { tag: string }).tag, 'svg')
  const busy = findAll(view(state({ kind: 'no-workspace' }, { refreshing: true }), en, handlers()), byKey('refresh'))[0]
  assert.equal(busy.attrs.class, 'icon-btn spinning')
})

test('the plan mode is a badge next to the Plan heading, not beside the title', () => {
  const tree = view(state({ kind: 'in-progress', ...ready }), en, handlers())
  const badge = findAll(tree, byKey('badge:plan'))[0]
  assert.equal(textOf(badge), 'full')
  const head = findAll(tree, byClass('card-title'))[0]
  assert.match(textOf(head), /^Plan full$/)
  const titleRow = findAll(tree, byClass('row')).find((row) => textOf(row).includes('Auth plan'))
  assert.equal(textOf(titleRow!), 'Auth plan')
})

test('missing context artifacts get a button that runs their command in the agent', () => {
  const h = handlers()
  const tree = view(state({ kind: 'in-progress', ...ready }, { contextOpen: true }), en, h)
  const fix = findAll(tree, byKey('fix:architecture'))[0]
  assert.equal(textOf(fix), '▶ /aif-architecture')
  assert.equal(findAll(tree, byKey('fix:config')).length, 0, 'present artifacts get no button')
  fix.on.click(new Event('click'))
  assert.deepEqual(h.ran, ['architecture'])
  const busy = view(state({ kind: 'in-progress', ...ready }, { pending: 'architecture', contextOpen: true }), en, h)
  assert.equal(findAll(busy, byKey('fix:architecture'))[0].attrs.disabled, '')
})

describe('New buttons', () => {
  test('plan and roadmap headers have New, which drafts the command instead of running it', () => {
    const h = handlers()
    const tree = view(state({ kind: 'in-progress', ...ready }), en, h)
    const plan = findAll(tree, byKey('new:plan'))[0]
    const roadmap = findAll(tree, byKey('new:roadmap'))[0]
    assert.equal(textOf(plan), '+ New')
    plan.on.click(new Event('click'))
    roadmap.on.click(new Event('click'))
    assert.deepEqual(h.drafted, ['plan', 'roadmap'])
    assert.deepEqual(h.ran, [])
  })

  test('the plan card offers New even without a plan, and New is disabled while a command is sent', () => {
    const empty = view(state({ kind: 'no-plan', ...ready, plan: null }), panelTexts('ru'), handlers())
    assert.equal(textOf(findAll(empty, byKey('new:plan'))[0]), '+ Новый')
    const busy = view(state({ kind: 'in-progress', ...ready }, { pending: 'plan' }), en, handlers())
    assert.equal(findAll(busy, byKey('new:plan'))[0].attrs.disabled, '')
  })
})

describe('context card', () => {
  const allPresent = ready.artifacts.map((artifact) => ({ ...artifact, exists: true }))

  test('folded by default: no items, a count when something is missing', () => {
    const tree = view(state({ kind: 'in-progress', ...ready }), en, handlers())
    assert.equal(findAll(tree, byClass('artifacts')).length, 0)
    assert.equal(textOf(findAll(tree, byKey('context:count'))[0]), '1/2')
    assert.equal(findAll(tree, byKey('context:complete')).length, 0)
    assert.equal(findAll(tree, byKey('context:toggle'))[0].attrs['aria-expanded'], 'false')
  })

  test('a green check when every item is present', () => {
    const tree = view(state({ kind: 'in-progress', ...ready, artifacts: allPresent }), en, handlers())
    assert.equal(textOf(findAll(tree, byKey('context:complete'))[0]), '✓')
    assert.equal(findAll(tree, byKey('context:count')).length, 0)
  })

  test('the header toggles it open', () => {
    let toggled = 0
    const h = { ...handlers(), toggleContext: () => void toggled++ }
    findAll(view(state({ kind: 'in-progress', ...ready }), en, h), byKey('context:toggle'))[0].on.click(new Event('click'))
    assert.equal(toggled, 1)
    const open = view(state({ kind: 'in-progress', ...ready }, { contextOpen: true }), en, handlers())
    assert.equal(findAll(open, byClass('artifacts')).length, 1)
    assert.equal(findAll(open, byKey('context:toggle'))[0].attrs['aria-expanded'], 'true')
  })
})

test('unfinished milestones get a Plan button that drafts /aif-plan for that milestone', () => {
  const h = handlers()
  const tree = view(state({ kind: 'in-progress', ...ready }), en, h)
  assert.equal(findAll(tree, byKey('plan-milestone:Catalog')).length, 0, 'done milestones have none')
  const button = findAll(tree, byKey('plan-milestone:Auth'))[0]
  assert.equal(textOf(button), 'Plan')
  button.on.click(new Event('click'))
  assert.deepEqual(h.drafted, ['plan:Auth — login and sessions'])
})

test('the header has an Explore icon left of Refresh that drafts /aif-explore', () => {
  const h = handlers()
  const tree = view(state({ kind: 'in-progress', ...ready }), en, h)
  const actions = findAll(tree, byClass('header-actions'))[0]
  assert.deepEqual(actions.children.map((child) => (child as { attrs: Record<string, string> }).attrs['data-key']), ['explore', 'refresh'])
  findAll(tree, byKey('explore'))[0].on.click(new Event('click'))
  assert.deepEqual(h.drafted, ['explore'])
  assert.equal(findAll(view(state({ kind: 'not-installed', workspace }), en, h), byKey('explore')).length, 0)
  assert.equal(findAll(view(state({ kind: 'in-progress', ...ready }, { pending: 'plan' }), en, h), byKey('explore'))[0].attrs.disabled, '')
})
