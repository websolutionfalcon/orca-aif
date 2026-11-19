// File-system adapter: finds the focused workspace's folder and reads its AI Factory artifacts.
// Only I/O here; every decision is made by src/core. Paths from config.yaml are confined to the
// workspace root (symlinks included) and files are read up to MAX_FILE_BYTES.
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { CONFIG_PATH, resolveConfig } from '../core/config.ts'
import { countUltraMarkers, discoverPlan, type PlansDirEntry } from '../core/plans.ts'
import type { StatusInput } from '../core/status.ts'
import type { AifConfig, ArtifactEntry, ArtifactKey, WorkspaceRef } from '../core/types.ts'
import type { Logger } from './log.ts'
import type { ListedWorkspace, WorkspaceContext } from './orcaHost.ts'

export const MAX_FILE_BYTES = 1024 * 1024
export const INSTALL_JSON = '.ai-factory.json'
export const AIF_DIR = '.ai-factory'

/** Warnings already logged; a refresh or poll repeats the same problem many times. */
const loggedWarnings = new Set<string>()
const MAX_LOGGED_WARNINGS = 500

/** Logs a warning the first time it is seen (per worker run); returns whether it was logged. */
export function warnOnce(log: Logger, scope: string, message: string, data: Record<string, unknown>): boolean {
  const key = `${scope}|${message}|${JSON.stringify(data)}`
  if (loggedWarnings.has(key)) return false
  if (loggedWarnings.size >= MAX_LOGGED_WARNINGS) loggedWarnings.clear()
  loggedWarnings.add(key)
  log.warn(scope, message, data)
  return true
}

export interface ResolvedWorkspace {
  ref: WorkspaceRef
  matchedBy: 'id' | 'name' | 'none'
}

/** Matches the focused context to a `workspace.list` row: by id, else by name and branch. */
export function resolveWorkspace(context: WorkspaceContext, list: ListedWorkspace[]): ResolvedWorkspace | null {
  if (!context) return null
  const byId = context.workspaceId ? list.find((row) => row.id === context.workspaceId) : undefined
  const byName = byId ? undefined : list.find((row) => row.name === context.displayName && row.branch === context.branch)
  const row = byId ?? byName
  return {
    ref: {
      id: row?.id ?? context.workspaceId ?? '',
      name: row?.name ?? context.displayName,
      branch: context.branch || row?.branch || null,
      path: row?.path ?? null,
      hostId: row?.hostId ?? null
    },
    matchedBy: byId ? 'id' : byName ? 'name' : 'none'
  }
}

/** A workspace whose files live on another host (SSH, runtime): this worker cannot read them. */
export function isRemote(ref: WorkspaceRef): boolean {
  return ref.hostId !== null && ref.hostId !== 'local'
}

function isMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Reads one workspace root; collects warnings instead of throwing for expected problems. */
export class WorkspaceReader {
  readonly warnings: string[] = []
  private realRoot: string | null = null

  /** `quiet` collects warnings without logging them (change polling). */
  constructor(
    readonly root: string,
    private readonly log: Logger,
    private readonly quiet = false
  ) {}

  private warn(message: string, data: Record<string, unknown>): void {
    this.warnings.push(message)
    if (!this.quiet) warnOnce(this.log, 'fs', message, { ...data, root: this.root })
  }

  /** Absolute path for a workspace-relative path, or null when it leaves the root. */
  async resolve(rel: string): Promise<string | null> {
    const absolute = resolve(this.root, rel)
    if (!inside(this.root, absolute)) {
      this.warn(`${rel} is outside the workspace`, { rel })
      return null
    }
    try {
      this.realRoot ??= await realpath(this.root)
      const real = await realpath(absolute)
      if (!inside(this.realRoot, real)) {
        this.warn(`${rel} links outside the workspace`, { rel })
        return null
      }
      return real
    } catch (error) {
      if (isMissing(error)) return absolute
      throw error
    }
  }

  async exists(rel: string): Promise<boolean> {
    const absolute = await this.resolve(rel)
    if (!absolute) return false
    try {
      await stat(absolute)
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  /** File text, or null when missing, too large or outside the root. */
  async readText(rel: string): Promise<string | null> {
    const absolute = await this.resolve(rel)
    if (!absolute) return null
    try {
      const info = await stat(absolute)
      if (!info.isFile()) return null
      if (info.size > MAX_FILE_BYTES) {
        this.warn(`${rel} is larger than ${MAX_FILE_BYTES} bytes; skipped`, { rel, size: info.size })
        return null
      }
      return await readFile(absolute, 'utf8')
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  /** Direct children of the plans directory, with the ultra marker count of each folder. */
  async listPlans(config: AifConfig): Promise<PlansDirEntry[]> {
    const absolute = await this.resolve(config.paths.plans)
    if (!absolute) return []
    let dirents
    try {
      dirents = await readdir(absolute, { withFileTypes: true })
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    const entries: PlansDirEntry[] = []
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.')) continue
      if (dirent.isDirectory()) {
        const index = await this.readText(`${config.paths.plans.replace(/\/+$/, '')}/${dirent.name}/index.md`)
        entries.push({ name: dirent.name, isDir: true, ultraMarkers: index === null ? undefined : countUltraMarkers(index) })
      } else if (dirent.isFile()) {
        entries.push({ name: dirent.name, isDir: false })
      }
    }
    return entries
  }

  /** mtime and size of a path, `-` when missing; used for change detection. */
  async signature(rel: string): Promise<string> {
    const absolute = await this.resolve(rel)
    if (!absolute) return `${rel}:outside`
    try {
      const info = await stat(absolute)
      return `${rel}:${info.mtimeMs}:${info.size}`
    } catch (error) {
      if (isMissing(error)) return `${rel}:-`
      throw error
    }
  }
}

const ARTIFACTS: { key: ArtifactKey; path: (config: AifConfig) => string }[] = [
  { key: 'config', path: () => CONFIG_PATH },
  { key: 'description', path: (config) => config.paths.description },
  { key: 'architecture', path: (config) => config.paths.architecture },
  { key: 'roadmap', path: (config) => config.paths.roadmap },
  { key: 'rulesFile', path: (config) => config.paths.rulesFile },
  { key: 'rules', path: (config) => config.paths.rules.replace(/\/+$/, '') }
]

/** Everything buildStatus needs for a local workspace. Throws only on unexpected I/O errors. */
export async function readWorkspace(ref: WorkspaceRef & { path: string }, log: Logger): Promise<StatusInput> {
  const reader = new WorkspaceReader(ref.path, log)
  const installed = (await reader.exists(AIF_DIR)) || (await reader.exists(INSTALL_JSON))
  const configText = await reader.readText(CONFIG_PATH)
  const config = resolveConfig(configText)
  for (const warning of config.warnings) warnOnce(log, 'config', warning, { root: ref.path })

  const artifacts: ArtifactEntry[] = []
  for (const artifact of ARTIFACTS) {
    const path = artifact.path(config)
    artifacts.push({ key: artifact.key, path, exists: await reader.exists(path) })
  }

  const entries = installed ? await reader.listPlans(config) : []
  const discovery = discoverPlan({
    branch: ref.branch,
    config,
    entries,
    fastPlanExists: installed && (await reader.exists(config.paths.plan)),
    fixPlanExists: installed && (await reader.exists(config.paths.fixPlan))
  })
  log.debug('fs', 'plan discovery', {
    workspace: ref.id,
    reason: discovery.reason,
    plan: discovery.plan?.path ?? null,
    candidates: discovery.candidates.length
  })

  return {
    workspace: ref,
    installed,
    config,
    artifacts,
    discovery,
    planText: discovery.plan ? await reader.readText(discovery.plan.path) : null,
    roadmapText: installed ? await reader.readText(config.paths.roadmap) : null,
    installJson: await reader.readText(INSTALL_JSON),
    warnings: reader.warnings
  }
}

/**
 * Cheap change signature of a workspace: mtime/size of config, install file, context artifacts,
 * fast/fix plans, the plans directory and each of its entries (and each bundle's index.md).
 */
export async function fingerprintWorkspace(root: string, log: Logger): Promise<string> {
  const reader = new WorkspaceReader(root, log, true)
  const config = resolveConfig(await reader.readText(CONFIG_PATH))
  const paths = [
    CONFIG_PATH,
    INSTALL_JSON,
    AIF_DIR,
    config.paths.description,
    config.paths.architecture,
    config.paths.roadmap,
    config.paths.rulesFile,
    config.paths.plan,
    config.paths.fixPlan,
    config.paths.plans
  ]
  const plansDir = config.paths.plans.replace(/\/+$/, '')
  for (const entry of await reader.listPlans(config)) {
    paths.push(entry.isDir ? join(plansDir, entry.name, 'index.md') : join(plansDir, entry.name))
  }
  const parts: string[] = []
  for (const path of paths) parts.push(await reader.signature(path.replace(/\\/g, '/')))
  return parts.join('|')
}
