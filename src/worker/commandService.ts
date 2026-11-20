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
  /** Clock for the "agent is starting" window; tests pass their own. */
  now?: () => number
  /**
   * Resolves when a launched agent's terminal is idle and ready for input (rejects on timeout).
   * With it, the command is typed once the agent is ready instead of relying on the launch
   * prompt, which Orca can lose while the agent starts. Without it, the launch prompt is used.
   */
  waitForIdle?: (terminalId: string) => Promise<void>
}

/** How long a just-launched agent counts as starting (before `agents.list` shows it). */
export const STARTING_MS = 60_000

const STATE_ORDER: ListedAgent['state'][] = ['waiting', 'done', 'working']

/**
 * The agent to type into: idle ones first, then busy ones; only agents with a terminal. An agent
 * `blocked` on a permission prompt is never picked: typed text and Enter would answer the prompt.
 */
export function pickAgent(agents: ListedAgent[]): (ListedAgent & { terminalId: string }) | null {
  const usable = agents.filter(
    (agent): agent is ListedAgent & { terminalId: string } => Boolean(agent.terminalId) && agent.state !== 'blocked'
  )
  usable.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state))
  return usable[0] ?? null
}

export function createCommandService(deps: CommandServiceDeps) {
  const { host, log } = deps
  const now = deps.now ?? (() => Date.now())
  /** Agents launched per workspace that `agents.list` may not show yet. */
  const starting = new Map<string, { terminalId: string; at: number }>()
  /** Background deliveries in flight; `settled()` awaits them (tests, shutdown). */
  const deliveries = new Set<Promise<void>>()

  /** Types the command into a just-launched agent once it is idle; tells the user if it never is. */
  function deliverWhenReady(workspaceId: string, terminalId: string, command: string, text: string): void {
    const delivery = (async () => {
      try {
        await deps.waitForIdle!(terminalId)
        const accepted = await host.sendText(terminalId, text, true)
        if (!accepted) throw new Error('the agent terminal did not accept the text')
        log.info('command', `[FIX:launch-prompt] ${command} delivered to the started agent`, { terminal: terminalId, length: text.length })
      } catch (error) {
        log.warn('command', '[FIX:launch-prompt] command not delivered to the started agent', { command, terminal: terminalId, error: messageOf(error) })
        try {
          await host.notify('AI Factory', `The agent did not get ready in time. Type ${text} in its terminal.`)
        } catch (notifyError) {
          log.warn('command', 'notification failed', { error: messageOf(notifyError) })
        }
      } finally {
        starting.delete(workspaceId)
      }
    })()
    deliveries.add(delivery)
    void delivery.finally(() => deliveries.delete(delivery))
  }

  /** Shows a terminal in Orca; a launched agent otherwise stays in a background tab. */
  async function show(terminalId: string): Promise<boolean> {
    try {
      return await host.focusTerminal(terminalId)
    } catch (error) {
      log.warn('command', 'could not show the agent terminal', { terminal: terminalId, error: messageOf(error) })
      return false
    }
  }

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
        let agents: ListedAgent[] = []
        try {
          agents = await host.listAgents()
        } catch (error) {
          log.warn('command', 'agents.list failed; starting a new agent', { error: messageOf(error) })
        }
        agent = pickAgent(agents)
        if (agent) starting.clear()
        if (!agent && agents.some((candidate) => candidate.state === 'blocked' && candidate.terminalId)) {
          log.info('command', '[FIX:blocked-agent] refused: the only agent waits for a permission answer', { command: command.id })
          return refuse(command.id, 'the agent in this workspace is waiting for a permission answer; answer it first')
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
      const pending = starting.get(workspaceId)
      if (settings.sendMode === 'agent-or-launch' && pending && now() - pending.at < STARTING_MS) {
        await show(pending.terminalId)
        log.info('command', '[FIX:double-launch] agent still starting; not launching another', { command: command.id, terminal: pending.terminalId })
        return refuse(command.id, 'an agent is still starting in this workspace; wait until it is ready, then run the command again')
      }
      const typeLater = Boolean(deps.waitForIdle)
      const terminalId = await host.launchAgent(workspaceId, settings.defaultAgent, typeLater ? undefined : built.text)
      starting.set(workspaceId, { terminalId, at: now() })
      const shown = await show(terminalId)
      log.info('command', `${command.id} -> launched`, { terminal: terminalId, agent: settings.defaultAgent, length: built.text.length, shown, typeLater })
      if (typeLater) deliverWhenReady(workspaceId, terminalId, command.id, built.text)
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

  return {
    run,
    /** Resolves once every background delivery has finished. */
    settled: async (): Promise<void> => {
      await Promise.allSettled([...deliveries])
    }
  }
}

export type CommandService = ReturnType<typeof createCommandService>
