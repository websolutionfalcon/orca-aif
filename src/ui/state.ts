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
}

export const INITIAL_STATE: PanelState = {
  loading: true,
  status: null,
  commands: [],
  pending: null,
  notice: null,
  showDone: false,
  skillsQuery: '',
  skillsOpen: false
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

export function reduce(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case 'loaded':
      return { ...state, loading: false, status: action.status, commands: action.commands }
    case 'status':
      return { ...state, loading: false, status: action.status }
    case 'pending':
      return { ...state, pending: action.command, notice: null }
    case 'commandDone':
      return { ...state, pending: null, notice: { kind: 'ok', lead: action.lead, detail: action.text } }
    case 'failed':
      return { ...state, loading: false, pending: null, notice: { kind: 'error', lead: action.lead, detail: action.message } }
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
