// Polls a fingerprint and calls onChange when it changes and then stays stable for `debounceMs`.
// Polling (not fs.watch) works the same on every platform and costs a few stat calls.
import { messageOf, type Logger } from './log.ts'

export interface WatcherOptions {
  intervalMs: number
  debounceMs?: number
  fingerprint: () => Promise<string>
  onChange: () => void
  log: Logger
}

export interface Watcher {
  stop(): void
  /** One poll now; resolves when it is done. Tests call it instead of waiting for the timer. */
  poll(): Promise<void>
}

export function createWatcher(options: WatcherOptions): Watcher {
  const debounceMs = options.debounceMs ?? 300
  let last: string | null = null
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let debounce: ReturnType<typeof setTimeout> | null = null

  async function poll(): Promise<void> {
    if (stopped) return
    try {
      const current = await options.fingerprint()
      if (last !== null && current !== last) {
        options.log.debug('watch', 'change detected')
        if (debounce) clearTimeout(debounce)
        if (debounceMs === 0) options.onChange()
        else debounce = setTimeout(() => {
          debounce = null
          if (!stopped) options.onChange()
        }, debounceMs)
      }
      last = current
    } catch (error) {
      options.log.error('watch', 'fingerprint failed', { error: messageOf(error) })
    }
  }

  function schedule(): void {
    if (stopped) return
    timer = setTimeout(async () => {
      await poll()
      schedule()
    }, options.intervalMs)
  }

  void poll().then(schedule)
  return {
    stop(): void {
      stopped = true
      if (timer) clearTimeout(timer)
      if (debounce) clearTimeout(debounce)
    },
    poll
  }
}
