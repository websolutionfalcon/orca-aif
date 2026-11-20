// The fixed catalog of AI Factory commands the plugin may send, and how their text is built.
// Only catalog commands plus a sanitized one-line argument ever reach a terminal.
import type { AifCommandId } from './types.ts'

export type ArgumentPolicy = 'none' | 'optional' | 'required'

export interface AifCommand {
  id: AifCommandId
  /** Skill name without prefix, e.g. `aif-plan`. */
  skill: string
  title: string
  arg: ArgumentPolicy
  /** Placeholder for the argument field. */
  argHint: string
}

export const AIF_COMMANDS: readonly AifCommand[] = [
  { id: 'setup', skill: 'aif', title: 'Set up', arg: 'optional', argHint: 'project description' },
  { id: 'warmup', skill: 'aif-warmup', title: 'Warm up', arg: 'none', argHint: '' },
  { id: 'explore', skill: 'aif-explore', title: 'Explore', arg: 'optional', argHint: 'topic' },
  { id: 'roadmap', skill: 'aif-roadmap', title: 'Roadmap', arg: 'optional', argHint: 'check | vision' },
  { id: 'plan', skill: 'aif-plan', title: 'Plan', arg: 'required', argHint: '[fast|full|ultra] feature description' },
  { id: 'improve', skill: 'aif-improve', title: 'Improve plan', arg: 'optional', argHint: 'what to refine' },
  { id: 'implement', skill: 'aif-implement', title: 'Implement', arg: 'optional', argHint: 'status | task number | @plan' },
  { id: 'verify', skill: 'aif-verify', title: 'Verify', arg: 'optional', argHint: '--strict' },
  { id: 'review', skill: 'aif-review', title: 'Review', arg: 'optional', argHint: 'PR number or URL' },
  { id: 'commit', skill: 'aif-commit', title: 'Commit', arg: 'none', argHint: '' },
  { id: 'fix', skill: 'aif-fix', title: 'Fix', arg: 'required', argHint: 'bug description' },
  { id: 'docs', skill: 'aif-docs', title: 'Docs', arg: 'none', argHint: '' },
  { id: 'architecture', skill: 'aif-architecture', title: 'Architecture', arg: 'optional', argHint: 'explicit | structured | microservices | layers' },
  { id: 'rules', skill: 'aif-rules', title: 'Rules', arg: 'optional', argHint: 'rule text' }
]

export const MAX_ARGUMENT_LENGTH = 500

export type CommandPrefixSetting = 'auto' | '/' | '$'

export function findCommand(id: string): AifCommand | undefined {
  return AIF_COMMANDS.find((command) => command.id === id)
}

/** `$` for Codex (`$aif-*` skills), `/` for Claude Code and other slash agents; a set prefix wins. */
export function prefixFor(agentKind: string | null | undefined, setting: CommandPrefixSetting = 'auto'): '/' | '$' {
  if (setting === '/' || setting === '$') return setting
  return agentKind?.toLowerCase().includes('codex') ? '$' : '/'
}

/** One line, no control characters, trimmed, at most MAX_ARGUMENT_LENGTH; empty → undefined. */
export function sanitizeArgument(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw
    // ANSI escape sequences (colors, cursor moves) and other control characters.
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ARGUMENT_LENGTH)
    .trim()
  return cleaned === '' ? undefined : cleaned
}

export type BuildResult = { ok: true; text: string; command: AifCommand } | { ok: false; error: string }

/** `/aif-plan add search` from a catalog id, prefix and optional argument. */
export function buildCommandText(id: string, prefix: '/' | '$', rawArgument?: unknown): BuildResult {
  const command = findCommand(id)
  if (!command) return { ok: false, error: `unknown command: ${id}` }
  const argument = command.arg === 'none' ? undefined : sanitizeArgument(rawArgument)
  if (command.arg === 'required' && !argument) {
    return { ok: false, error: `${prefix}${command.skill} needs an argument: ${command.argHint}` }
  }
  return { ok: true, command, text: argument ? `${prefix}${command.skill} ${argument}` : `${prefix}${command.skill}` }
}
