// The plugin's worker: Orca transpiles this file when it loads it (no build step). It only wires
// services together: commands, events, panel requests, the change watcher and the status bar.
// Because the manifest has a status bar item, Orca keeps this worker running while it is enabled.
import type { OrcaWorkerApi } from 'orca/worker'
import { AIF_COMMANDS, prefixFor } from './core/commands.ts'
import { summaryOf } from './core/status.ts'
import type { AifStatus } from './core/types.ts'
import type { Outcome, PanelCommand } from './protocol.ts'
import { createCommandService, pickAgent } from './worker/commandService.ts'
import { createLogger, messageOf, type Logger } from './worker/log.ts'
import { createOrcaHost } from './worker/orcaHost.ts'
import { openOwnPanel, pluginKeyFromLocation, runOrcaCli } from './worker/orcaCli.ts'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './worker/settings.ts'
import { createStatusService } from './worker/statusService.ts'
import { createWatcher, type Watcher } from './worker/watcher.ts'
import { fingerprintWorkspace, isRemote } from './worker/workspaceFs.ts'

export const VERSION = '0.1.3'

function systemLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return 'en'
  }
}

/** Paths the panel may open: those the current status names (artifacts, plan, roadmap, candidates). */
export function openablePaths(status: AifStatus): Set<string> {
  const paths = new Set<string>()
  if (!('artifacts' in status)) return paths
  for (const artifact of status.artifacts) if (artifact.exists && artifact.key !== 'rules') paths.add(artifact.path)
  if (status.plan) paths.add(status.plan.path)
  if (status.roadmap) paths.add(status.roadmap.path)
  for (const candidate of status.candidates) paths.add(candidate)
  for (const skill of status.skills) paths.add(skill.path)
  return paths
}

let stopWorker: () => void = () => undefined

export default function activate(orca: OrcaWorkerApi): void {
  let settings: Settings = DEFAULT_SETTINGS
  const log: Logger = createLogger(orca, () => settings.logLevel)
  const locale = systemLocale()
  const host = createOrcaHost(orca, log)
  const disposables: { dispose(): void }[] = []
  let watcher: Watcher | null = null
  let watchedRoot: string | null = null
  let watchedInterval = 0
  let stopped = false

  const status = createStatusService({
    host,
    log,
    storage: orca.storage,
    post: (next) => void postStatus(next),
    notifyOnPlanDone: () => settings.notifyOnPlanDone,
    locale
  })
  const commands = createCommandService({
    host,
    log,
    settings: () => settings,
    workspaceId: async () => {
      const known = status.workspace()?.id
      if (known) return known
      return (await host.readContext())?.workspaceId ?? null
    }
  })

  /** Watches the focused local workspace; restarts when it or the interval changes. */
  function syncWatcher(): void {
    const workspace = status.workspace()
    const root = workspace?.path && !isRemote(workspace) ? workspace.path : null
    const interval = settings.pollIntervalSec * 1000
    if (root === watchedRoot && interval === watchedInterval) return
    watcher?.stop()
    watcher = null
    watchedRoot = root
    watchedInterval = interval
    if (!root || stopped) return
    log.info('watch', 'watching workspace', { workspace: workspace?.id, intervalSec: settings.pollIntervalSec })
    watcher = createWatcher({
      intervalMs: interval,
      fingerprint: () => fingerprintWorkspace(root, log),
      onChange: () => refreshInBackground('poll'),
      log
    })
  }

  async function refresh(reason: string): Promise<AifStatus> {
    const next = await status.refresh(reason)
    syncWatcher()
    return next
  }

  /** Fire-and-forget refresh for events and timers: a failure is logged, never unhandled. */
  function refreshInBackground(reason: string): void {
    refresh(reason).catch((error: unknown) => log.error('status', '[FIX:refresh] background refresh failed', { reason, error: messageOf(error) }))
  }

  async function postStatus(next: AifStatus): Promise<void> {
    try {
      orca.panels.post('status.changed', { status: next, commands: await panelCommands(next) })
    } catch (error) {
      log.warn('panel', '[FIX:post] status.changed not delivered', { error: messageOf(error) })
    }
  }

  async function loadSettings(): Promise<void> {
    try {
      settings = parseSettings((await orca.settings.get()) as Record<string, unknown>)
      log.debug('settings', 'loaded', { sendMode: settings.sendMode, pollIntervalSec: settings.pollIntervalSec, logLevel: settings.logLevel })
    } catch (error) {
      log.warn('settings', 'could not read settings; using defaults', { error: messageOf(error) })
    }
  }

  /** Buttons with the prefix the command would actually be sent with (running agent first). */
  async function panelCommands(current: AifStatus = status.current()): Promise<PanelCommand[]> {
    const installed = 'installedAgents' in current ? current.installedAgents : []
    let running: string | null = null
    if (settings.sendMode === 'agent-or-launch') {
      try {
        running = pickAgent(await host.listAgents())?.agent ?? null
      } catch (error) {
        log.debug('panel', 'agents.list failed while labelling commands', { error: messageOf(error) })
      }
    }
    const fallback = settings.sendMode === 'always-launch' ? settings.defaultAgent : installed.length === 1 ? installed[0] : settings.defaultAgent
    const prefix = prefixFor(running ?? fallback, settings.commandPrefix)
    log.debug('panel', '[FIX:prefix] command labels', { prefix, running, fallback })
    // The whole catalog: the panel picks what it needs (set up, missing context artifacts).
    return AIF_COMMANDS.map((command) => ({ id: command.id, label: `${prefix}${command.skill}`, title: command.title, arg: command.arg, argHint: command.argHint }))
  }

  async function answer<T extends object>(name: string, run: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
    const started = Date.now()
    try {
      const result = await run()
      log.debug('panel', 'request', { name, ok: result.ok, ms: Date.now() - started })
      return result
    } catch (error) {
      log.error('panel', 'request failed', { name, error: messageOf(error) })
      return { ok: false, error: messageOf(error) }
    }
  }

  // Palette commands.
  // Orca shows a command's string result only when it runs from the palette, so a status bar click
  // shows the AI Factory panel tab itself. The host API cannot pick a sidebar tab; the `orca` CLI
  // can (`plugin open --panel`). If the CLI fails, fall back to toggling the right sidebar.
  const pluginKey = pluginKeyFromLocation(import.meta.url)
  disposables.push(
    orca.commands.register('aif.statusClick', async () => {
      log.info('command', '[FIX:status-click] status bar clicked; showing the panel', { pluginKey })
      try {
        if (process.env.AIF_DISABLE_CLI === '1') throw new Error('CLI disabled')
        await openOwnPanel(runOrcaCli, pluginKey)
      } catch (error) {
        log.warn('command', '[FIX:status-click] orca plugin open failed; toggling the sidebar', { error: messageOf(error) })
        try {
          await host.runAction('sidebar.right.toggle')
        } catch (toggleError) {
          log.warn('command', '[FIX:status-click] could not toggle the sidebar', { error: messageOf(toggleError) })
        }
      }
      return summaryOf(await refresh('command:status-click'), locale)
    })
  )
  disposables.push(orca.commands.register('aif.summary', async () => summaryOf(await refresh('command:summary'), locale)))
  disposables.push(
    orca.commands.register('aif.refresh', async () => summaryOf(await refresh('command:refresh'), locale))
  )
  for (const command of AIF_COMMANDS) {
    disposables.push(
      orca.commands.register(`aif.run.${command.id}`, async () => {
        const result = await commands.run({ command: command.id, source: 'palette' })
        return result.ok ? `${result.text} → ${result.action}` : result.error
      })
    )
  }

  // Orca events.
  disposables.push(orca.events.on('workspace.changed', () => refreshInBackground('event:workspace.changed')))
  disposables.push(orca.events.on('agent.status.changed', () => refreshInBackground('event:agent.status.changed')))

  // Settings and panel requests.
  disposables.push(
    orca.settings.onDidChange(() => {
      void loadSettings().then(() => refreshInBackground('settings'))
    })
  )
  disposables.push(
    orca.panels.handle('status.get', () =>
      answer('status.get', async () => {
        const current = await refresh('panel')
        return { ok: true, status: current, commands: await panelCommands(current) }
      })
    )
  )
  disposables.push(
    orca.panels.handle('status.refresh', () => answer('status.refresh', async () => ({ ok: true, status: await refresh('panel:refresh') })))
  )
  disposables.push(
    orca.panels.handle('command.run', ({ command, argument }) =>
      answer('command.run', async () => {
        const result = await commands.run({ command, argument, source: 'panel' })
        return result.ok ? { ok: true, action: result.action, terminalId: result.terminalId, text: result.text } : result
      })
    )
  )
  disposables.push(
    orca.panels.handle('file.open', ({ path }) =>
      answer<{ path: string }>('file.open', async () => {
        const current = status.current()
        const workspace = status.workspace()
        if (!workspace || !openablePaths(current).has(path)) {
          log.warn('panel', 'file.open refused', { path })
          return { ok: false, error: `cannot open ${path}` }
        }
        await host.openEditor(workspace.id, path)
        log.info('panel', 'opened file', { path })
        return { ok: true, path }
      })
    )
  )
  disposables.push(
    orca.panels.handle('agents.get', () => answer('agents.get', async () => ({ ok: true, agents: await host.listAgents() })))
  )

  stopWorker = () => {
    stopped = true
    watcher?.stop()
    for (const disposable of disposables.splice(0)) disposable.dispose()
    log.info('worker', 'deactivated')
  }

  log.info('worker', `activated v${VERSION}`, { locale })
  void loadSettings().then(() => refreshInBackground('activate'))
}

/** Orca awaits this before it stops the worker. */
export function deactivate(): void {
  stopWorker()
  stopWorker = () => undefined
}
