// Panel entry (panel/index.html loads it). Talks to the worker only through src/protocol.ts.
import type { PanelCommand } from '../protocol.ts'
import { render } from './dom.ts'
import { commandRunInput, draftText } from './requests.ts'
import { panelTexts } from './i18n.ts'
import { INITIAL_STATE, reduce, type Action, type CardKey, type PanelState } from './state.ts'

const COLLAPSED_KEY = 'ui:collapsed'
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

const MOTION_MS = 700
let motionTimer: ReturnType<typeof setTimeout> | null = null

function dispatch(action: Action): void {
  state = reduce(state, action)
  draw()
  // One-shot animations: clear the intent once it has played so later renders do not replay it.
  const { enter, card, notice } = state.motion
  if (action.type !== 'motionDone' && (enter || card || notice)) {
    if (motionTimer) clearTimeout(motionTimer)
    motionTimer = setTimeout(() => {
      motionTimer = null
      dispatch({ type: 'motionDone' })
    }, MOTION_MS)
  }
}

async function load(): Promise<void> {
  try {
    dispatch({ type: 'restoreCollapsed', collapsed: await orca.storage.get(COLLAPSED_KEY) })
  } catch {
    // Defaults stay.
  }
  try {
    const answer = await orca.plugin.request('status.get')
    if (answer.ok) dispatch({ type: 'loaded', status: answer.status, commands: answer.commands })
    else dispatch({ type: 'failed', lead: t.failed, message: answer.error })
  } catch (error) {
    dispatch({ type: 'failed', lead: t.failed, message: errorText(error) })
  }
}

/** Sends a catalog command; `draft` types it without Enter for the user's own prompt. */
/**
 * Copies a draft while the click still counts as a user gesture (the clipboard needs one). Used
 * when Orca opens the agent as a chat, whose input a plugin cannot fill.
 */
function copyDraft(text: string): Promise<boolean> {
  try {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false
    )
  } catch {
    return Promise.resolve(false)
  }
}

function send(command: PanelCommand, draft: boolean, argumentOverride?: string): void {
  if (state.pending) return
  const argument = argumentOverride ?? (draft ? undefined : args.get(command.id)?.trim() || undefined)
  const copied = draft ? copyDraft(draftText(command.label, argument)) : Promise.resolve(false)
  dispatch({ type: 'pending', command: command.id })
  void (async () => {
    try {
      const answer = await orca.plugin.request('command.run', commandRunInput(command.id, argument, draft), { timeoutMs: 60_000 })
      if (!answer.ok) {
        dispatch({ type: 'failed', lead: t.failed, message: answer.error })
        return
      }
      if (!draft) args.delete(command.id)
      const lead = answer.action === 'chat' ? ((await copied) ? t.chatCopied : t.chatType) : t[answer.action]
      dispatch({ type: 'commandDone', action: answer.action, text: answer.text.trim(), lead })
    } catch (error) {
      dispatch({ type: 'failed', lead: t.failed, message: errorText(error) })
    }
  })()
}

const handlers = {
  refresh(): void {
    if (state.refreshing) return
    dispatch({ type: 'refreshing' })
    void (async () => {
      try {
        const answer = await orca.plugin.request('status.refresh')
        if (answer.ok) dispatch({ type: 'status', status: answer.status })
        else dispatch({ type: 'failed', lead: t.failed, message: answer.error })
      } catch (error) {
        dispatch({ type: 'failed', lead: t.failed, message: errorText(error) })
      }
    })()
  },
  run(command: PanelCommand): void {
    send(command, false)
  },
  draft(command: PanelCommand, argument?: string): void {
    send(command, true, argument)
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
  toggleDone(): void {
    dispatch({ type: 'toggleDone' })
  },
  toggleCard(key: CardKey): void {
    dispatch({ type: 'toggleCard', key })
    // Remember folded cards across panel reloads; storage is a convenience, so failures are ignored.
    void orca.storage.set(COLLAPSED_KEY, state.collapsed).catch(() => undefined)
  },
  skillsSearch(query: string): void {
    dispatch({ type: 'skillsQuery', query })
  },
  toggleSkills(): void {
    dispatch({ type: 'toggleSkills' })
  },
  argInput(command: PanelCommand, value: string): void {
    args.set(command.id, value)
  },
  argValue(command: PanelCommand): string {
    return args.get(command.id) ?? ''
  }
}

orca.plugin.on('status.changed', ({ status, commands }) => dispatch({ type: 'loaded', status, commands }))
draw()
void load()
