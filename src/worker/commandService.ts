// Sends an AI Factory command to the workspace's agent, or starts an agent with it.
// Supported combinations (plan, "Requirements Reconciliation"):
//   agent running + argument ok        → terminal.sendText with Enter          → 'sent'
//   no agent (or always-launch) + ok   → agent.launch with the command prompt  → 'launched'
//   agent running + required arg missing, from the palette
//                                      → type `/aif-x ` without Enter, focus   → 'typed'
//   required arg missing otherwise     → refused with a message
import { buildCommandText, findCommand, prefixFor } from '../core/commands.ts'
import { messageOf, type Logger } from './log.ts'
import type { ListedAgent, OrcaHost } from './orcaHost.ts'
import type { Settings } from './settings.ts'

export type CommandSource = 'palette' | 'panel'
export type CommandAction = 'sent' | 'launched' | 'typed'

export interface RunCommandInput {
  command: string
  argument?: unknown
  source: CommandSource
}

export type RunCommandResult =
  | { ok: true; action: CommandAction; terminalId: string; text: string }
  | { ok: false; error: string }

export interface CommandServiceDeps {
  host: OrcaHost
  log: Logger
  settings: () => Settings
  /** Id of the focused workspace (as `workspace.list` names it), or null. */
  workspaceId: () => Promise<string | null>
}

const STATE_ORDER: ListedAgent['state'][] = ['waiting', 'done', 'working', 'blocked']

/** The agent to type into: idle ones first, then busy ones; only agents with a terminal. */
export function pickAgent(agents: ListedAgent[]): (ListedAgent & { terminalId: string }) | null {
  const usable = agents.filter((agent): agent is ListedAgent & { terminalId: string } => Boolean(agent.terminalId))
  usable.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state))
  return usable[0] ?? null
}

export function createCommandService(deps: CommandServiceDeps) {
  const { host, log } = deps

  async function run(input: RunCommandInput): Promise<RunCommandResult> {
    const settings = deps.settings()
    const command = findCommand(input.command)
    if (!command) {
      log.warn('command', 'unknown command refused', { command: input.command })
      return { ok: false, error: `unknown command: ${input.command}` }
    }
    const argumentLength = typeof input.argument === 'string' ? input.argument.length : 0
    log.debug('command', 'run', { command: command.id, source: input.source, argumentLength })

    try {
      let agent: ReturnType<typeof pickAgent> = null
      if (settings.sendMode === 'agent-or-launch') {
        try {
          agent = pickAgent(await host.listAgents())
        } catch (error) {
          log.warn('command', 'agents.list failed; starting a new agent', { error: messageOf(error) })
        }
      }
      const prefix = prefixFor(agent?.agent ?? settings.defaultAgent, settings.commandPrefix)
      const built = buildCommandText(command.id, prefix, input.argument)

      if (agent) {
        if (built.ok) {
          const accepted = await host.sendText(agent.terminalId, built.text, true)
          if (!accepted) return refuse(command.id, 'the agent terminal did not accept the text')
          log.info('command', `${command.id} -> sent`, { terminal: agent.terminalId, agent: agent.agent, length: built.text.length })
          return { ok: true, action: 'sent', terminalId: agent.terminalId, text: built.text }
        }
        if (input.source === 'palette' && command.arg === 'required') {
          const draft = `${prefix}${command.skill} `
          const accepted = await host.sendText(agent.terminalId, draft, false)
          if (!accepted) return refuse(command.id, 'the agent terminal did not accept the text')
          const focused = await host.focusTerminal(agent.terminalId).catch(() => false)
          log.info('command', `${command.id} -> typed`, { terminal: agent.terminalId, focused })
          return { ok: true, action: 'typed', terminalId: agent.terminalId, text: draft }
        }
        return refuse(command.id, built.error)
      }

      if (!built.ok) {
        const hint = input.source === 'palette' ? ' Enter it in the AI Factory panel, or start an agent first.' : ''
        return refuse(command.id, `${built.error}.${hint}`)
      }
      const workspaceId = await deps.workspaceId()
      if (!workspaceId) return refuse(command.id, 'no workspace is focused')
      const terminalId = await host.launchAgent(workspaceId, settings.defaultAgent, built.text)
      log.info('command', `${command.id} -> launched`, { terminal: terminalId, agent: settings.defaultAgent, length: built.text.length })
      return { ok: true, action: 'launched', terminalId, text: built.text }
    } catch (error) {
      log.error('command', 'failed', { command: command.id, error: messageOf(error) })
      return { ok: false, error: messageOf(error) }
    }
  }

  function refuse(command: string, error: string): RunCommandResult {
    log.warn('command', 'refused', { command, error })
    return { ok: false, error }
  }

  return { run }
}

export type CommandService = ReturnType<typeof createCommandService>
