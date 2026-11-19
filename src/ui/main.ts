// Panel entry (panel/index.html loads it). Talks to the worker only through src/protocol.ts.
import type { PanelCommand } from '../protocol.ts'
import { render } from './dom.ts'
import { panelTexts } from './i18n.ts'
import { INITIAL_STATE, reduce, type Action, type PanelState } from './state.ts'
import { view } from './view.ts'

const t = panelTexts(orca.locale)
const app = document.getElementById('app')!
const args = new Map<string, string>()
let state: PanelState = INITIAL_STATE

function errorText(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown }
    return [typeof code === 'string' ? code : null, typeof message === 'string' ? message : null].filter(Boolean).join(': ')
  }
  return String(error)
}

/** Re-renders and puts the caret back into the field that had focus. */
function draw(): void {
  const active = document.activeElement as HTMLInputElement | null
  const key = active?.getAttribute?.('data-key') ?? null
  const caret = active && 'selectionStart' in active ? active.selectionStart : null
  app.replaceChildren(render(view(state, t, handlers), document))
  if (!key) return
  const again = app.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
  if (!again) return
  again.focus()
  if (caret !== null && again instanceof HTMLInputElement) again.setSelectionRange(caret, caret)
}

function dispatch(action: Action): void {
  state = reduce(state, action)
  draw()
}

async function loadAgents(): Promise<void> {
  try {
    const answer = await orca.plugin.request('agents.get')
    if (answer.ok) dispatch({ type: 'agents', agents: answer.agents })
  } catch {
    // Agents are optional context; the status still shows.
  }
}

async function load(): Promise<void> {
  try {
    const answer = await orca.plugin.request('status.get')
    if (answer.ok) dispatch({ type: 'loaded', status: answer.status, commands: answer.commands })
    else dispatch({ type: 'failed', lead: t.failed, message: answer.error })
  } catch (error) {
    dispatch({ type: 'failed', lead: t.failed, message: errorText(error) })
  }
  await loadAgents()
}

const handlers = {
  refresh(): void {
    void (async () => {
      try {
        const answer = await orca.plugin.request('status.refresh')
        if (answer.ok) dispatch({ type: 'status', status: answer.status })
        else dispatch({ type: 'failed', lead: t.failed, message: answer.error })
      } catch (error) {
        dispatch({ type: 'failed', lead: t.failed, message: errorText(error) })
      }
      await loadAgents()
    })()
  },
  run(command: PanelCommand): void {
    if (state.pending) return
    const argument = args.get(command.id)?.trim() || undefined
    dispatch({ type: 'pending', command: command.id })
    void (async () => {
      try {
        const answer = await orca.plugin.request('command.run', { command: command.id, argument }, { timeoutMs: 60_000 })
        if (!answer.ok) {
          dispatch({ type: 'failed', lead: t.failed, message: answer.error })
          return
        }
        args.delete(command.id)
        dispatch({ type: 'commandDone', action: answer.action, text: answer.text, lead: t[answer.action] })
        await loadAgents()
      } catch (error) {
        dispatch({ type: 'failed', lead: t.failed, message: errorText(error) })
      }
    })()
  },
  open(path: string): void {
    void orca.plugin.request('file.open', { path }).then(
      (answer) => {
        if (!answer.ok) dispatch({ type: 'failed', lead: t.failed, message: answer.error })
      },
      (error: unknown) => dispatch({ type: 'failed', lead: t.failed, message: errorText(error) })
    )
  },
  dismiss(): void {
    dispatch({ type: 'dismiss' })
  },
  argInput(command: PanelCommand, value: string): void {
    args.set(command.id, value)
  },
  argValue(command: PanelCommand): string {
    return args.get(command.id) ?? ''
  }
}

orca.plugin.on('status.changed', (status) => dispatch({ type: 'status', status }))
orca.on('agent.status.changed', () => void loadAgents())
orca.on('workspace.changed', () => void loadAgents())
draw()
void load()
