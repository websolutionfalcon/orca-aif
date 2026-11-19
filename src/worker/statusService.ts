// Keeps the AI Factory status of the focused workspace current: reads it, updates the status bar,
// tells open panels and remembers the last status in orca.storage (a worker restart keeps it).
import { texts } from '../core/i18n.ts'
import { buildStatus, statusBarOf } from '../core/status.ts'
import type { AifStatus, WorkspaceRef } from '../core/types.ts'
import { messageOf, type Logger } from './log.ts'
import type { OrcaHost } from './orcaHost.ts'
import { isRemote, readWorkspace, resolveWorkspace } from './workspaceFs.ts'

export const LAST_STATUS_KEY = 'status:last'

export interface StatusStore {
  get(key: string): Promise<unknown>
  set(key: string, value: never): Promise<void>
}

export interface StatusServiceDeps {
  host: OrcaHost
  log: Logger
  storage: StatusStore
  /** Sends `status.changed` to open panels. */
  post: (status: AifStatus) => void
  notifyOnPlanDone: () => boolean
  locale?: string
}

export interface StatusService {
  refresh(reason: string): Promise<AifStatus>
  current(): AifStatus
  /** The focused workspace as of the last refresh. */
  workspace(): WorkspaceRef | null
}

/** Plan identity across workspaces: the same relative path in two workspaces is two plans. */
function planKey(status: AifStatus): string | null {
  return 'plan' in status && status.plan ? `${status.workspace.id}|${status.plan.path}` : null
}

export function createStatusService(deps: StatusServiceDeps): StatusService {
  const { host, log } = deps
  let status: AifStatus = { kind: 'no-workspace' }
  let lastSerialized: string | null = null
  let restored = false
  let running: Promise<AifStatus> | null = null
  let queued: Promise<AifStatus> | null = null

  async function restore(): Promise<void> {
    if (restored) return
    restored = true
    try {
      const saved = await deps.storage.get(LAST_STATUS_KEY)
      if (saved && typeof saved === 'object' && 'kind' in saved) {
        status = saved as AifStatus
        log.debug('status', 'restored last status', { kind: status.kind })
      }
    } catch (error) {
      log.warn('status', 'could not restore last status', { error: messageOf(error) })
    }
  }

  async function read(): Promise<AifStatus> {
    const context = await host.readContext()
    if (!context) return { kind: 'no-workspace' }
    let list: Awaited<ReturnType<OrcaHost['listWorkspaces']>> = []
    try {
      list = await host.listWorkspaces()
    } catch (error) {
      log.warn('status', 'workspace.list failed; matching by context only', { error: messageOf(error) })
    }
    const resolved = resolveWorkspace(context, list)
    if (!resolved) return { kind: 'no-workspace' }
    const { ref, matchedBy } = resolved
    if (matchedBy === 'name') log.warn('status', 'workspace matched by name and branch, not id', { workspace: ref.id })
    if (isRemote(ref)) return { kind: 'remote', workspace: ref }
    if (!ref.path) return { kind: 'error', workspace: ref, message: 'Orca did not give this workspace a folder' }
    const input = await readWorkspace({ ...ref, path: ref.path }, log)
    return buildStatus(input)
  }

  async function apply(next: AifStatus, reason: string, startedAt: number): Promise<AifStatus> {
    const previous = status
    const serialized = JSON.stringify(next)
    status = next
    log.debug('status', 'refreshed', { reason, kind: next.kind, plan: planKey(next), ms: Date.now() - startedAt })
    if (serialized === lastSerialized) return next
    lastSerialized = serialized

    if (previous.kind !== next.kind) log.info('status', `${previous.kind} -> ${next.kind}`, { reason })
    try {
      await host.updateStatusBar(statusBarOf(next, deps.locale))
    } catch (error) {
      log.warn('status', 'status bar not updated', { error: messageOf(error) })
    }
    try {
      deps.post(next)
    } catch (error) {
      log.warn('status', '[FIX:post] status not posted to panels', { error: messageOf(error) })
    }
    try {
      await deps.storage.set(LAST_STATUS_KEY, next as never)
    } catch (error) {
      log.warn('status', 'could not store status', { error: messageOf(error) })
    }

    const finished = previous.kind === 'in-progress' && next.kind === 'done' && planKey(previous) === planKey(next)
    if (previous.kind === 'in-progress' && next.kind === 'done' && !finished) {
      log.debug('status', '[FIX:plan-key] done status of another plan or workspace; no notification', { plan: planKey(next) })
    }
    if (finished && deps.notifyOnPlanDone() && next.kind === 'done' && next.plan) {
      const t = texts(deps.locale)
      try {
        await host.notify(t.name, `${next.plan.title ?? next.plan.path}: ${t.done}`)
        log.info('status', 'plan done notification shown', { plan: next.plan.path })
      } catch (error) {
        log.warn('status', 'notification failed', { error: messageOf(error) })
      }
    }
    return next
  }

  async function runOnce(reason: string): Promise<AifStatus> {
    await restore()
    const startedAt = Date.now()
    let next: AifStatus
    try {
      next = await read()
    } catch (error) {
      log.error('status', 'refresh failed', { reason, error: messageOf(error) })
      next = { kind: 'error', workspace: 'workspace' in status ? status.workspace : null, message: messageOf(error) }
    }
    return apply(next, reason, startedAt)
  }

  /** At most one refresh runs; calls during it share one follow-up refresh. */
  function refresh(reason: string): Promise<AifStatus> {
    if (!running) {
      running = runOnce(reason).finally(() => {
        running = null
      })
      return running
    }
    if (!queued) {
      // Runs after the current refresh whether it resolved or rejected, so one failure never
      // leaves a stale rejected promise behind.
      const followUp = (): Promise<AifStatus> => {
        queued = null
        return refresh(reason)
      }
      queued = running.then(followUp, followUp)
    }
    return queued
  }

  return {
    refresh,
    current: () => status,
    workspace: () => ('workspace' in status ? status.workspace : null)
  }
}
