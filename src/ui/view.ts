// Builds the panel's virtual tree from state. Pure: handlers come in, nothing is read from Orca.
import type { AifStatus, PlanInfo, ReadyStatus } from '../core/types.ts'
import type { PanelCommand } from '../protocol.ts'
import { h, type VNode } from './dom.ts'
import { filterSkills } from './skills.ts'
import type { PanelTexts } from './i18n.ts'
import type { PanelState } from './state.ts'

export interface ViewHandlers {
  refresh(): void
  run(command: PanelCommand): void
  open(path: string): void
  dismiss(): void
  toggleDone(): void
  skillsSearch(query: string): void
  toggleSkills(): void
  argInput(command: PanelCommand, value: string): void
  argValue(command: PanelCommand): string
}

type Ready = Extract<AifStatus, ReadyStatus>

function card(title: string, ...children: (VNode | string | null | false)[]): VNode {
  return h('section', { class: 'card' }, h('h2', null, title), ...children)
}

/** A card whose header carries an "Open" button for the markdown file it shows. */
function fileCard(
  title: string,
  open: { key: string; path: string; t: PanelTexts; handlers: ViewHandlers },
  ...children: (VNode | string | null | false)[]
): VNode {
  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', null, title),
      h(
        'button',
        {
          class: 'card-action',
          attrs: { type: 'button', 'data-key': `open:${open.key}`, title: `${open.t.openInEditor}: ${open.path}`, 'aria-label': `${open.t.openInEditor}: ${open.path}` },
          on: { click: () => open.handlers.open(open.path) }
        },
        `${open.t.open} ↗`
      )
    ),
    ...children
  )
}

function fileLink(path: string, label: string, handlers: ViewHandlers): VNode {
  return h('button', { class: 'link', attrs: { type: 'button', title: path }, on: { click: () => handlers.open(path) } }, label)
}

function progress(done: number, total: number): VNode {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  return h(
    'div',
    { class: 'progress', attrs: { role: 'progressbar', 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100 } },
    h('div', { attrs: { style: `width: ${percent}%` } })
  )
}

/** Circular arrow, drawn with the current text colour. */
function refreshIcon(): VNode {
  return h(
    'svg',
    { attrs: { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' } },
    h('path', { attrs: { d: 'M20 12a8 8 0 1 1-2.34-5.66' } }),
    h('path', { attrs: { d: 'M20 4v4.5h-4.5' } })
  )
}

function header(state: PanelState, t: PanelTexts, handlers: ViewHandlers): VNode {
  const status = state.status
  const workspace = status && 'workspace' in status ? status.workspace : null
  const branch = workspace?.branch && workspace.branch !== workspace.name ? ` · ${workspace.branch}` : ''
  const where = workspace ? `${workspace.name}${branch}` : ''
  return h(
    'header',
    { class: 'header' },
    h('div', null, h('h1', null, t.title), where ? h('div', { class: 'subtle' }, where) : null),
    h(
      'button',
      {
        class: `icon-btn${state.refreshing ? ' spinning' : ''}`,
        attrs: { type: 'button', 'data-key': 'refresh', title: t.refresh, 'aria-label': t.refresh, 'aria-busy': state.refreshing },
        on: { click: () => handlers.refresh() }
      },
      refreshIcon()
    )
  )
}

function notice(state: PanelState, handlers: ViewHandlers): VNode | null {
  if (!state.notice) return null
  return h(
    'div',
    { class: `banner ${state.notice.kind}`, attrs: { role: state.notice.kind === 'error' ? 'alert' : 'status' }, on: { click: () => handlers.dismiss() } },
    `${state.notice.lead}: `,
    h('code', null, state.notice.detail)
  )
}

function contextCard(status: Ready, t: PanelTexts, handlers: ViewHandlers): VNode {
  return card(
    t.context,
    h(
      'ul',
      { class: 'artifacts' },
      status.artifacts.map((artifact) =>
        h(
          'li',
          { class: artifact.exists ? 'present' : 'absent' },
          h('span', { class: 'mark' }, artifact.exists ? '●' : '○'),
          artifact.exists && artifact.key !== 'rules'
            ? fileLink(artifact.path, t.artifacts[artifact.key], handlers)
            : h('span', { class: artifact.exists ? 'text' : 'text subtle' }, `${t.artifacts[artifact.key]}${artifact.exists ? '' : ` — ${t.missing}`}`)
        )
      )
    )
  )
}

/** Task text without markdown code ticks; the full text stays in the tooltip. */
export function plainText(text: string): string {
  return text.replace(/`([^`]*)`/g, '$1')
}

function taskList(plan: PlanInfo, state: PanelState, t: PanelTexts, handlers: ViewHandlers): VNode[] {
  const nextIndex = plan.tasks.findIndex((task) => !task.done)
  const nodes: VNode[] = []
  if (plan.done > 0) {
    nodes.push(
      h(
        'li',
        null,
        h(
          'button',
          { class: 'link subtle', attrs: { type: 'button', 'data-key': 'toggle-done', 'aria-expanded': state.showDone }, on: { click: () => handlers.toggleDone() } },
          `${state.showDone ? '▾' : '▸'} ${t.completed} (${plan.done})`
        )
      )
    )
  }
  let phase: string | null | undefined
  plan.tasks.forEach((task, index) => {
    if (task.done && !state.showDone) return
    if (task.phase !== phase) {
      phase = task.phase
      if (phase) nodes.push(h('li', { class: 'phase' }, plainText(phase)))
    }
    const classes = [task.done ? 'done' : '', task.isCommit ? 'commit' : '', index === nextIndex ? 'next' : ''].filter(Boolean).join(' ')
    const text = plainText(task.id !== null ? `${task.id}. ${task.title}` : task.title)
    nodes.push(
      h(
        'li',
        { class: classes || undefined },
        h('span', { class: 'mark' }, task.done ? '✓' : index === nextIndex ? '▶' : '○'),
        h('span', { class: 'text clamp', attrs: { title: text } }, text)
      )
    )
  })
  return nodes
}

function planCard(status: Ready, state: PanelState, t: PanelTexts, handlers: ViewHandlers): VNode {
  if (status.kind === 'ambiguous') {
    return card(
      t.plan,
      h('p', null, t.ambiguous),
      h('ul', { class: 'artifacts' }, status.candidates.map((path) => h('li', null, h('span', { class: 'mark' }, '•'), fileLink(path, path, handlers))))
    )
  }
  const plan = status.plan
  if (!plan) return card(t.plan, h('p', { class: 'subtle' }, t.noPlan))
  return fileCard(
    t.plan,
    { key: 'plan', path: plan.path, t, handlers },
    h('div', { class: 'row' }, fileLink(plan.path, plainText(plan.title ?? plan.path), handlers), h('span', { class: 'subtle' }, t.kinds[plan.kind])),
    progress(plan.done, plan.total),
    h('div', { class: 'subtle' }, status.kind === 'done' ? t.allDone : `${plan.done}/${plan.total} ${t.tasks}`),
    h('ul', { class: 'tasks' }, taskList(plan, state, t, handlers))
  )
}

function roadmapCard(status: Ready, t: PanelTexts, handlers: ViewHandlers): VNode | null {
  const roadmap = status.roadmap
  if (!roadmap || roadmap.total === 0) return null
  return fileCard(
    t.roadmap,
    { key: 'roadmap', path: roadmap.path, t, handlers },
    h('div', { class: 'row' }, fileLink(roadmap.path, `${roadmap.done}/${roadmap.total} ${t.milestones}`, handlers)),
    progress(roadmap.done, roadmap.total),
    h(
      'ul',
      { class: 'milestones' },
      roadmap.milestones.map((milestone) =>
        h(
          'li',
          { class: [milestone.done ? 'done' : '', milestone === roadmap.next ? 'next' : ''].filter(Boolean).join(' ') || undefined },
          h('span', { class: 'mark' }, milestone.done ? '✓' : milestone === roadmap.next ? '▶' : '○'),
          h('span', { class: 'text', attrs: { title: milestone.description || undefined } }, milestone.name)
        )
      )
    )
  )
}

function commandsCard(commands: PanelCommand[], state: PanelState, t: PanelTexts, handlers: ViewHandlers): VNode {
  return card(
    t.commands,
    h(
      'div',
      { class: 'commands' },
      commands.map((command) => {
        const busy = state.pending !== null
        const input =
          command.arg === 'none'
            ? null
            : h('input', {
                attrs: {
                  type: 'text',
                  'data-key': `arg:${command.id}`,
                  value: handlers.argValue(command),
                  placeholder: `${command.argHint} (${command.arg === 'required' ? t.argRequired : t.argOptional})`,
                  'aria-label': `${command.label} ${command.argHint}`,
                  maxlength: 500,
                  disabled: busy
                },
                on: {
                  input: (event) => handlers.argInput(command, (event.target as HTMLInputElement).value),
                  keydown: (event) => {
                    if ((event as KeyboardEvent).key === 'Enter') handlers.run(command)
                  }
                }
              })
        return h(
          'div',
          { class: 'command' },
          h(
            'button',
            {
              class: `btn${state.pending === command.id ? ' primary' : ''}`,
              attrs: { type: 'button', 'data-key': `run:${command.id}`, title: command.title, disabled: busy },
              on: { click: () => handlers.run(command) }
            },
            command.label
          ),
          input
        )
      })
    )
  )
}

function skillsCard(status: Ready, state: PanelState, t: PanelTexts, handlers: ViewHandlers): VNode {
  const all = status.skills
  const query = state.skillsQuery.trim()
  const found = filterSkills(all, query)
  const open = query !== '' || state.skillsOpen
  const summary = query !== '' ? `${t.skillsFound}: ${found.length} / ${all.length}` : `${t.skillsAll} (${all.length})`
  return card(
    t.skills,
    h('input', {
      class: 'search',
      attrs: { type: 'search', 'data-key': 'skills:search', value: state.skillsQuery, placeholder: t.skillsSearch, 'aria-label': t.skillsSearch, maxlength: 200 },
      on: {
        input: (event) => handlers.skillsSearch((event.target as HTMLInputElement).value),
        keydown: (event) => {
          if ((event as KeyboardEvent).key === 'Escape') handlers.skillsSearch('')
        }
      }
    }),
    h(
      'button',
      {
        class: 'link subtle spoiler',
        attrs: { type: 'button', 'data-key': 'skills:toggle', 'aria-expanded': open, disabled: query !== '' },
        on: { click: () => handlers.toggleSkills() }
      },
      `${open ? '▾' : '▸'} ${summary}`
    ),
    open
      ? found.length === 0
        ? h('p', { class: 'subtle' }, all.length === 0 ? t.skillsNone : t.skillsNothing)
        : h(
            'ul',
            { class: 'skills' },
            found.map((skill) =>
              h(
                'li',
                { attrs: { 'data-key': `skill:${skill.name}` } },
                h(
                  'div',
                  { class: 'row' },
                  h('button', { class: 'link skill-name', attrs: { type: 'button', title: skill.path }, on: { click: () => handlers.open(skill.path) } }, `/${skill.name}`),
                  skill.argumentHint ? h('code', { class: 'subtle hint', attrs: { title: skill.argumentHint } }, skill.argumentHint) : null
                ),
                skill.description ? h('div', { class: 'subtle clamp', attrs: { title: skill.description } }, skill.description) : null
              )
            )
          )
      : null
  )
}

export function view(state: PanelState, t: PanelTexts, handlers: ViewHandlers): VNode {
  const status = state.status
  const parts: (VNode | null)[] = [header(state, t, handlers), notice(state, handlers)]
  const setup = state.commands.find((command) => command.id === 'setup')

  if (state.loading || !status) {
    parts.push(h('p', { class: 'subtle' }, t.loading))
  } else if (status.kind === 'no-workspace') {
    parts.push(h('div', { class: 'banner' }, t.noWorkspace))
  } else if (status.kind === 'not-installed') {
    parts.push(
      h('div', { class: 'banner' }, t.notInstalled),
      commandsCard(setup ? [setup] : [{ id: 'setup', label: '/aif', title: t.setUp, arg: 'optional', argHint: 'project description' }], state, t, handlers)
    )
  } else if (status.kind === 'remote' || status.kind === 'error') {
    parts.push(
      status.kind === 'remote'
        ? h('div', { class: 'banner' }, t.remote)
        : h('div', { class: 'banner error', attrs: { role: 'alert' } }, `${t.errorTitle}: `, h('code', null, status.message)),
    )
  } else {
    parts.push(
      planCard(status, state, t, handlers),
      roadmapCard(status, t, handlers),
      contextCard(status, t, handlers),
      status.warnings.length > 0
        ? card(t.warnings, h('ul', null, status.warnings.map((warning) => h('li', { class: 'subtle' }, warning))))
        : null,
      skillsCard(status, state, t, handlers)
    )
  }
  return h('div', { class: 'root' }, ...parts)
}
