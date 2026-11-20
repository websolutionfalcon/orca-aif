// Sends an AI Factory command to the workspace's agent, or starts an agent with it.
// Supported combinations (plan, "Requirements Reconciliation"):
//   agent running + argument ok        → terminal.sendText with Enter          → 'sent'
//   no agent (or always-launch) + ok   → agent.launch with the command prompt  → 'launched'
//   agent running + required arg missing, from the palette
//                                      → type `/aif-x ` without Enter, focus   → 'typed'
//   required arg missing otherwise     → refused with a message
import { buildCommandText, findCommand, prefixFor, sanitizeArgument } from '../core/commands.ts'
import { messageOf, type Logger } from './log.ts'
import type { ListedAgent, OrcaHost } from './orcaHost.ts'
import type { Settings } from './settings.ts'

export type CommandSource = 'palette' | 'panel'
/** `chat`: a chat opened for a draft; the panel copies the text for the user to paste. */
export type CommandAction = 'sent' | 'launched' | 'typed' | 'chat'

export interface RunCommandInput {
  command: string
  argument?: unknown
  source: CommandSource
  /** Type `/aif-x ` without Enter so the user writes the prompt (the panel's New buttons). */
  draft?: boolean
}

export type RunCommandResult =
  | { ok: true; action: CommandAction; terminalId: string | null; text: string }
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
  /**
   * Starts an agent the way Orca's new agent tab does, honouring the user's Chat | CLI choice
   * (`orca agent launch`). Without it the host API is used, which always opens a terminal.
   */
  launcher?: (input: { agent: string; workspacePath: string; prompt?: string }) => Promise<LaunchOutcome>
  /** Folder of the focused workspace, for the launcher. */
  workspacePath?: () => string | null
  /** Whether a terminal's screen shows the text (did Orca deliver the launch prompt?). */
  screenHas?: (terminalId: string, text: string) => Promise<boolean>
}

export interface LaunchOutcome {
  surface: 'chat' | 'terminal'
  /** Terminal handle when the agent opened as a terminal. */
  terminalId: string | null
}

/** A chat has no terminal to watch, so a repeat click is held back only this long. */
export const CHAT_STARTING_MS = 4_000

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
  /** Agents launched per workspace that `agents.list` may not show yet (null: a chat). */
  const starting = new Map<string, { terminalId: string | null; at: number }>()
  /** Background deliveries in flight; `settled()` awaits them (tests, shutdown). */
  const deliveries = new Set<Promise<void>>()

  /** Types the command into a just-launched agent once it is idle; tells the user if it never is. */
  function deliverWhenReady(
    workspaceId: string,
    terminalId: string,
    command: string,
    text: string,
    enter: boolean,
    unlessShown = false
  ): void {
    const delivery = (async () => {
      try {
        await deps.waitForIdle!(terminalId)
        if (unlessShown && deps.screenHas && (await deps.screenHas(terminalId, text.trim()))) {
          log.info('command', `${command} launch prompt delivered by Orca`, { terminal: terminalId })
          return
        }
        const accepted = await host.sendText(terminalId, text, enter)
        if (!accepted) throw new Error('the agent terminal did not accept the text')
        log.info('command', `[FIX:launch-prompt] ${command} delivered to the started agent`, { terminal: terminalId, length: text.length, enter })
      } catch (error) {
        log.warn('command', '[FIX:launch-prompt] command not delivered to the started agent', { command, terminal: terminalId, error: messageOf(error) })
        try {
          await host.notify('AI Factory', `The agent did not get ready in time. Type ${text.trim()} in its terminal.`)
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
  async function show(terminalId: string | null): Promise<boolean> {
    if (!terminalId) return false
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
      const asDraft = input.draft === true
      // A draft ends with a space so the user keeps typing; a given argument comes first.
      const draftArgument = asDraft && command.arg !== 'none' ? sanitizeArgument(input.argument) : undefined
      const draftText = draftArgument ? `${prefix}${command.skill} ${draftArgument} ` : `${prefix}${command.skill} `

      if (agent) {
        if (built.ok && !asDraft) {
          const accepted = await host.sendText(agent.terminalId, built.text, true)
          if (!accepted) return refuse(command.id, 'the agent terminal did not accept the text')
          log.info('command', `${command.id} -> sent`, { terminal: agent.terminalId, agent: agent.agent, length: built.text.length })
          return { ok: true, action: 'sent', terminalId: agent.terminalId, text: built.text }
        }
        if (asDraft || (input.source === 'palette' && command.arg === 'required')) {
          const accepted = await host.sendText(agent.terminalId, draftText, false)
          if (!accepted) return refuse(command.id, 'the agent terminal did not accept the text')
          const focused = await show(agent.terminalId)
          log.info('command', `${command.id} -> typed`, { terminal: agent.terminalId, focused, draft: asDraft })
          return { ok: true, action: 'typed', terminalId: agent.terminalId, text: draftText }
        }
        return refuse(command.id, built.ok ? 'unexpected command state' : built.error)
      }

      if (!built.ok && !asDraft) {
        const hint = input.source === 'palette' ? ' Enter it in the AI Factory panel, or start an agent first.' : ''
        return refuse(command.id, `${built.error}.${hint}`)
      }
      const workspaceId = await deps.workspaceId()
      if (!workspaceId) return refuse(command.id, 'no workspace is focused')
      const pending = starting.get(workspaceId)
      const window = pending?.terminalId === null ? CHAT_STARTING_MS : STARTING_MS
      if (settings.sendMode === 'agent-or-launch' && pending && now() - pending.at < window) {
        await show(pending.terminalId)
        log.info('command', '[FIX:double-launch] agent still starting; not launching another', { command: command.id, terminal: pending.terminalId })
        return refuse(command.id, 'an agent is still starting in this workspace; wait until it is ready, then run the command again')
      }
      // A draft is never a launch prompt: Orca would submit it. It is typed once the agent is ready.
      const text = asDraft ? draftText : built.ok ? built.text : draftText
      const workspacePath = deps.workspacePath?.() ?? null
      if (deps.launcher && workspacePath) {
        const outcome = await deps.launcher({ agent: settings.defaultAgent, workspacePath, prompt: asDraft ? undefined : text })
        starting.set(workspaceId, { terminalId: outcome.terminalId, at: now() })
        log.info('command', `${command.id} -> launched as ${outcome.surface}`, { terminal: outcome.terminalId, agent: settings.defaultAgent, draft: asDraft })
        if (outcome.surface === 'chat' || !outcome.terminalId) {
          // A chat takes the prompt itself; a draft cannot be put into its input, so the panel copies it.
          return { ok: true, action: asDraft ? 'chat' : 'launched', terminalId: null, text }
        }
        await show(outcome.terminalId)
        if (deps.waitForIdle) deliverWhenReady(workspaceId, outcome.terminalId, command.id, text, !asDraft, !asDraft)
        else starting.delete(workspaceId)
        return { ok: true, action: 'launched', terminalId: outcome.terminalId, text }
      }
      const typeLater = asDraft || Boolean(deps.waitForIdle)
      const terminalId = await host.launchAgent(workspaceId, settings.defaultAgent, typeLater ? undefined : text)
      starting.set(workspaceId, { terminalId, at: now() })
      const shown = await show(terminalId)
      log.info('command', `${command.id} -> launched`, { terminal: terminalId, agent: settings.defaultAgent, length: text.length, shown, typeLater, draft: asDraft })
      if (typeLater && deps.waitForIdle) deliverWhenReady(workspaceId, terminalId, command.id, text, !asDraft)
      else if (typeLater) starting.delete(workspaceId)
      return { ok: true, action: 'launched', terminalId, text }
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
