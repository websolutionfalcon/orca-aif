// Panel state as pure reducers. Argument field text lives outside the state (main.ts) so typing
// never re-renders the panel.
import type { AifCommandId, AifStatus } from '../core/types.ts'
import type { CommandAction, PanelCommand } from '../protocol.ts'

export interface Notice {
  kind: 'ok' | 'error'
  /** Already-localized lead, e.g. "Sent". */
  lead: string
  detail: string
}

export interface PanelState {
  loading: boolean
  status: AifStatus | null
  commands: PanelCommand[]
  pending: AifCommandId | null
  notice: Notice | null
  /** Completed plan tasks are folded away unless this is on. */
  showDone: boolean
  /** Skills library search text; a non-empty query always unfolds the list. */
  skillsQuery: string
  /** Skills library unfolded with an empty query. */
  skillsOpen: boolean
  /** A manual refresh is running (the refresh icon spins). */
  refreshing: boolean
  /** Folded cards; the Context card starts folded, the others open. */
  collapsed: Record<CardKey, boolean>
}

export type CardKey = 'plan' | 'roadmap' | 'context' | 'skills'

export const DEFAULT_COLLAPSED: Record<CardKey, boolean> = { plan: false, roadmap: false, context: true, skills: false }

/** Folded-card preferences read back from storage; anything unexpected keeps the default. */
export function collapsedFrom(saved: unknown): Record<CardKey, boolean> {
  const result = { ...DEFAULT_COLLAPSED }
  if (!saved || typeof saved !== 'object') return result
  for (const key of Object.keys(result) as CardKey[]) {
    const value = (saved as Record<string, unknown>)[key]
    if (typeof value === 'boolean') result[key] = value
  }
  return result
}

export const INITIAL_STATE: PanelState = {
  loading: true,
  status: null,
  commands: [],
  pending: null,
  notice: null,
  showDone: false,
  skillsQuery: '',
  skillsOpen: false,
  refreshing: false,
  collapsed: { ...DEFAULT_COLLAPSED }
}

export type Action =
  | { type: 'loaded'; status: AifStatus; commands: PanelCommand[] }
  | { type: 'status'; status: AifStatus }
  | { type: 'pending'; command: AifCommandId }
  | { type: 'commandDone'; action: CommandAction; text: string; lead: string }
  | { type: 'failed'; lead: string; message: string }
  | { type: 'dismiss' }
  | { type: 'toggleDone' }
  | { type: 'skillsQuery'; query: string }
  | { type: 'toggleSkills' }
  | { type: 'refreshing' }
  | { type: 'toggleCard'; key: CardKey }
  | { type: 'restoreCollapsed'; collapsed: unknown }

export function reduce(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case 'loaded':
      return { ...state, loading: false, refreshing: false, status: action.status, commands: action.commands }
    case 'status':
      return { ...state, loading: false, refreshing: false, status: action.status }
    case 'refreshing':
      return { ...state, refreshing: true }
    case 'toggleCard':
      return { ...state, collapsed: { ...state.collapsed, [action.key]: !state.collapsed[action.key] } }
    case 'restoreCollapsed':
      return { ...state, collapsed: collapsedFrom(action.collapsed) }
    case 'pending':
      return { ...state, pending: action.command, notice: null }
    case 'commandDone':
      return { ...state, pending: null, notice: { kind: 'ok', lead: action.lead, detail: action.text } }
    case 'failed':
      return { ...state, loading: false, refreshing: false, pending: null, notice: { kind: 'error', lead: action.lead, detail: action.message } }
    case 'dismiss':
      return { ...state, notice: null }
    case 'toggleDone':
      return { ...state, showDone: !state.showDone }
    case 'skillsQuery':
      return { ...state, skillsQuery: action.query.slice(0, 200) }
    case 'toggleSkills':
      return { ...state, skillsOpen: !state.skillsOpen }
  }
}
