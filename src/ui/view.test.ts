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
    milestones: [{ name: 'Auth', description: 'x', done: false }],
    done: 0,
    total: 1,
    next: null
  },
  installedAgents: ['claude'],
  warnings: ['plan too large']
}
const commands: PanelCommand[] = [
  { id: 'plan', label: '/aif-plan', title: 'Plan', arg: 'required', argHint: 'description' },
  { id: 'commit', label: '/aif-commit', title: 'Commit', arg: 'none', argHint: '' }
]

function handlers(): ViewHandlers & { opened: string[]; ran: string[] } {
  const opened: string[] = []
  const ran: string[] = []
  return {
    opened,
    ran,
    refresh: () => undefined,
    run: (command) => ran.push(command.id),
    open: (path) => opened.push(path),
    dismiss: () => undefined,
    toggleDone: () => undefined,
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
  const tree = view(state({ kind: 'in-progress', ...ready }), en, h)
  const links = findAll(tree, byClass('link'))
  links.find((link) => link.attrs.title === '.ai-factory/config.yaml')?.on.click(new Event('click'))
  assert.deepEqual(h.opened, ['.ai-factory/config.yaml'])
  assert.ok(!links.some((link) => link.attrs.title === '.ai-factory/ARCHITECTURE.md'))
  assert.match(textOf(tree), /Architecture — missing/)
})

test('commands: input only for commands with an argument, disabled while pending', () => {
  const h = handlers()
  const idle = view(state({ kind: 'no-plan', ...ready, plan: null }), en, h)
  assert.equal(findAll(idle, byKey('arg:plan'))[0]?.attrs.value, 'typed')
  assert.equal(findAll(idle, byKey('arg:commit')).length, 0)
  findAll(idle, byKey('run:commit'))[0].on.click(new Event('click'))
  assert.deepEqual(h.ran, ['commit'])

  const busy = view(state({ kind: 'no-plan', ...ready, plan: null }, { pending: 'plan' }), en, h)
  assert.equal(findAll(busy, byKey('run:commit'))[0].attrs.disabled, '')
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
