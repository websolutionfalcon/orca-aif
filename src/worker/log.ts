// Leveled logger over orca.log (lands in `orca plugin logs`). The level comes from the plugin's
// `logLevel` setting, read on every call so a change applies at once. Never log file contents or
// prompt text: only paths, ids, counts and lengths.
import type { OrcaWorkerApi } from 'orca/worker'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug(scope: string, message: string, data?: Record<string, unknown>): void
  info(scope: string, message: string, data?: Record<string, unknown>): void
  warn(scope: string, message: string, data?: Record<string, unknown>): void
  error(scope: string, message: string, data?: Record<string, unknown>): void
}

export function isLogLevel(value: unknown): value is LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
}

function format(level: LogLevel, scope: string, message: string, data?: Record<string, unknown>): string {
  let suffix = ''
  if (data && Object.keys(data).length > 0) {
    try {
      suffix = ` ${JSON.stringify(data)}`
    } catch {
      suffix = ' {"data":"unserializable"}'
    }
  }
  return `${level.toUpperCase()} [aif:${scope}] ${message}${suffix}`
}

/** `getLevel` is read on each call; an unknown value means `info`. */
export function createLogger(orca: Pick<OrcaWorkerApi, 'log'>, getLevel: () => LogLevel): Logger {
  const write = (level: LogLevel, scope: string, message: string, data?: Record<string, unknown>): void => {
    const current = getLevel()
    if (RANK[level] < RANK[isLogLevel(current) ? current : 'info']) return
    orca.log(format(level, scope, message, data))
  }
  return {
    debug: (scope, message, data) => write('debug', scope, message, data),
    info: (scope, message, data) => write('info', scope, message, data),
    warn: (scope, message, data) => write('warn', scope, message, data),
    error: (scope, message, data) => write('error', scope, message, data)
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function codeOf(error: unknown): string | undefined {
  return error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined
}
