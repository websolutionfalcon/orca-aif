// The plugin's settings (contributes.settings in orca-plugin.json), validated with defaults.
import type { CommandPrefixSetting } from '../core/commands.ts'
import { isLogLevel, type LogLevel } from './log.ts'

export type SendMode = 'agent-or-launch' | 'always-launch'

export interface Settings {
  defaultAgent: string
  sendMode: SendMode
  commandPrefix: CommandPrefixSetting
  pollIntervalSec: number
  notifyOnPlanDone: boolean
  logLevel: LogLevel
}

export const DEFAULT_SETTINGS: Settings = {
  defaultAgent: 'claude',
  sendMode: 'agent-or-launch',
  commandPrefix: 'auto',
  pollIntervalSec: 3,
  notifyOnPlanDone: true,
  logLevel: 'info'
}

/** Validates what `orca.settings.get()` returned; anything invalid falls back to its default. */
export function parseSettings(raw: Record<string, unknown> | null | undefined): Settings {
  const value = raw ?? {}
  const agent = typeof value.defaultAgent === 'string' ? value.defaultAgent.trim() : ''
  const poll = typeof value.pollIntervalSec === 'number' && Number.isFinite(value.pollIntervalSec)
    ? Math.min(60, Math.max(1, Math.round(value.pollIntervalSec)))
    : DEFAULT_SETTINGS.pollIntervalSec
  return {
    defaultAgent: /^[A-Za-z0-9._-]{1,64}$/.test(agent) ? agent : DEFAULT_SETTINGS.defaultAgent,
    sendMode: value.sendMode === 'always-launch' ? 'always-launch' : 'agent-or-launch',
    commandPrefix: value.commandPrefix === '/' || value.commandPrefix === '$' ? value.commandPrefix : 'auto',
    pollIntervalSec: poll,
    notifyOnPlanDone: typeof value.notifyOnPlanDone === 'boolean' ? value.notifyOnPlanDone : true,
    logLevel: isLogLevel(value.logLevel) ? value.logLevel : 'info'
  }
}
