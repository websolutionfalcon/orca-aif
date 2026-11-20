// Thin wrappers over orca.host.call: one place for `host.has` checks, timing and error logging.
// Services never call orca.host directly.
import type { OrcaWorkerApi } from 'orca/worker'
import type { StatusBarView } from '../core/status.ts'
import { codeOf, messageOf, type Logger } from './log.ts'

export const STATUS_BAR_ITEM = 'status'

export type WorkspaceContext = {
  workspaceId?: string
  branch: string
  displayName: string
  terminals: { id: string; title?: string }[]
} | null

export interface ListedWorkspace {
  id: string
  kind: 'worktree' | 'folder'
  name: string
  path: string
  branch: string | null
  hostId: string | null
}

export interface ListedAgent {
  terminalId: string | null
  title: string | null
  agent: string | null
  state: 'working' | 'blocked' | 'waiting' | 'done'
  stateStartedAt: number
}

export class HostUnavailableError extends Error {
  readonly code = 'unavailable'
  constructor(method: string) {
    super(`this Orca has no ${method}`)
  }
}

export type OrcaHost = ReturnType<typeof createOrcaHost>

export function createOrcaHost(orca: OrcaWorkerApi, log: Logger) {
  async function call<T>(method: string, run: () => Promise<T>): Promise<T> {
    if (!orca.host.has(method)) {
      log.warn('host', 'method missing', { method })
      throw new HostUnavailableError(method)
    }
    const started = Date.now()
    try {
      const result = await run()
      log.debug('host', 'call ok', { method, ms: Date.now() - started })
      return result
    } catch (error) {
      const code = codeOf(error)
      const data = { method, code, ms: Date.now() - started, error: messageOf(error) }
      if (code === 'not_permitted' || code === 'capability_denied') log.warn('host', 'call refused', data)
      else log.error('host', 'call failed', data)
      throw error
    }
  }

  return {
    readContext: (): Promise<WorkspaceContext> =>
      call('workspace.readContext', () => orca.host.call('workspace.readContext', {})),

    listWorkspaces: async (): Promise<ListedWorkspace[]> => {
      const result = await call('workspace.list', () => orca.host.call('workspace.list', {}))
      return result.workspaces.map(({ id, kind, name, path, branch, hostId }) => ({ id, kind, name, path, branch, hostId }))
    },

    listAgents: async (): Promise<ListedAgent[]> => {
      const result = await call('agents.list', () => orca.host.call('agents.list', {}))
      return result.agents.map(({ terminalId, title, agent, state, stateStartedAt }) => ({
        terminalId,
        title,
        agent,
        state,
        stateStartedAt
      }))
    },

    updateStatusBar: async (view: StatusBarView): Promise<void> => {
      await call('statusBar.update', () =>
        orca.host.call('statusBar.update', {
          id: STATUS_BAR_ITEM,
          text: view.text,
          icon: view.icon,
          tone: view.tone,
          tooltip: view.tooltip,
          visible: view.visible
        })
      )
    },

    sendText: async (terminalId: string, text: string, enter: boolean): Promise<boolean> => {
      const result = await call('terminal.sendText', () => orca.host.call('terminal.sendText', { terminalId, text, enter }))
      return result.accepted
    },

    launchAgent: async (workspaceId: string, agent: string, prompt?: string): Promise<string> => {
      const params = prompt ? { workspaceId, agent, prompt } : { workspaceId, agent }
      const result = await call('agent.launch', () => orca.host.call('agent.launch', params))
      return result.terminalId
    },

    focusTerminal: async (terminalId: string): Promise<boolean> => {
      if (!orca.host.has('terminal.focus')) return false
      const result = await call('terminal.focus', () => orca.host.call('terminal.focus', { terminalId }))
      return result.focused
    },

    openEditor: async (workspaceId: string, path: string): Promise<void> => {
      await call('editor.open', () => orca.host.call('editor.open', { workspaceId, path }))
    },

    /** Runs one of Orca's built-in window actions (`workspace:write`, desktop app only). */
    runAction: async (action: 'sidebar.right.toggle'): Promise<void> => {
      await call('commands.run', () => orca.host.call('commands.run', { action }))
    },

    notify: async (title: string, body: string): Promise<void> => {
      await call('notifications.show', () => orca.host.call('notifications.show', { title, body }))
    }
  }
}
