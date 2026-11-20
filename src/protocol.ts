// The panel <-> worker contract, declared once: the worker (src/worker.ts) and the panel scripts
// (src/ui/*) both read it. Every answer is an Outcome: the worker never throws at the panel.
import type { ArgumentPolicy } from './core/commands.ts'
import type { AifCommandId, AifStatus } from './core/types.ts'

export type Outcome<T extends object> = ({ ok: true } & T) | { ok: false; error: string }

/** A catalog command as the panel shows it (prefix already chosen for the workspace's agent). */
export interface PanelCommand {
  id: AifCommandId
  label: string
  title: string
  arg: ArgumentPolicy
  argHint: string
}

export interface PanelAgent {
  terminalId: string | null
  title: string | null
  agent: string | null
  state: 'working' | 'blocked' | 'waiting' | 'done'
  stateStartedAt: number
}

/** `chat`: a chat opened for a draft; the panel copies the text for the user to paste. */
export type CommandAction = 'sent' | 'launched' | 'typed' | 'chat'

declare module 'orca' {
  interface PluginRequests {
    /** Current status plus the commands to show as buttons. */
    'status.get': { output: Outcome<{ status: AifStatus; commands: PanelCommand[] }> }
    /** Re-reads the workspace now. */
    'status.refresh': { output: Outcome<{ status: AifStatus }> }
    /** Sends a catalog command (with an optional argument) to the workspace agent. */
    'command.run': {
      input: { command: AifCommandId; argument?: string; draft?: boolean }
      output: Outcome<{ action: CommandAction; terminalId: string | null; text: string }>
    }
    /** Opens one of the artifacts the current status lists, in Orca's editor. */
    'file.open': { input: { path: string }; output: Outcome<{ path: string }> }
    /** Agents of the focused workspace. */
    'agents.get': { output: Outcome<{ agents: PanelAgent[] }> }
  }
  interface PluginPanelEvents {
    /** Posted to open panels whenever the status changes, with the buttons it implies. */
    'status.changed': { status: AifStatus; commands: PanelCommand[] }
  }
}
