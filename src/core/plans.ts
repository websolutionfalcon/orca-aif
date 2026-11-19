// Parses AI Factory plan files and finds the active plan the way `/aif-implement` does
// (.ai-factory/references/ai-factory-artifacts.md, "Поиск активного плана"). Pure: the worker
// lists the plans directory and reads files, this module only decides.
import type { AifConfig, PlanDiscoveryReason, PlanInfo, PlanKind, PlanTask } from './types.ts'

export const ULTRA_MARKER = '<!-- aif:plan-mode:ultra -->'
const COMMIT_MARKER = '<!-- aif:task-kind:commit -->'
const CHECKBOX = /^\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/
const TASK_ID = /^(?:Task|Задача)\s+(\d+)\s*[:.)-]\s*/i
const DETAILS_LINK = /\s*\(\[[^\]]*\]\([^)]*\)\)/g
const DEPENDS_SUFFIX = /\s*\((?:depends on|зависит от)[^)]*\)\s*$/i

/** How many times the ultra marker occurs; a bundle is valid only with exactly one. */
export function countUltraMarkers(text: string): number {
  return text.split(ULTRA_MARKER).length - 1
}

function frontmatterArchived(lines: string[]): boolean {
  if (lines[0]?.trim() !== '---') return false
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '---') return false
    if (/^archived:\s*\S/.test(line)) return true
  }
  return false
}

function quotedValue(raw: string): string {
  return raw.trim().replace(/^["'«]|["'»]$/g, '').trim()
}

/** Parses a fast/full/fix plan or an ultra `index.md`. */
export function parsePlan(markdown: string, path: string, kind: PlanKind): PlanInfo {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const candidates: (PlanTask & { numbered: boolean })[] = []
  let title: string | null = null
  let branch: string | null = null
  let phase: string | null = null
  let inFence = false
  let previous = ''
  const milestones: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (title === null && /^#\s+\S/.test(trimmed)) title = trimmed.replace(/^#\s+/, '')
    else if (/^#{2}\s+\S/.test(trimmed)) phase = null
    else if (/^#{3,}\s+\S/.test(trimmed)) phase = trimmed.replace(/^#{3,}\s+/, '')

    const branchMatch = /^Branch:\s*(.+)$/.exec(trimmed)
    if (branch === null && branchMatch) branch = branchMatch[1].trim()

    const milestoneMatch = /^(?:Milestone|Also completes):\s*(.+)$/.exec(trimmed)
    if (milestoneMatch) {
      const name = quotedValue(milestoneMatch[1])
      if (name && name.toLowerCase() !== 'none') milestones.push(name)
    }

    const checkbox = CHECKBOX.exec(line)
    if (checkbox) {
      const text = checkbox[2].replace(DETAILS_LINK, '').replace(DEPENDS_SUFFIX, '').trim()
      const idMatch = TASK_ID.exec(text)
      candidates.push({
        id: idMatch ? Number(idMatch[1]) : null,
        title: idMatch ? text.slice(idMatch[0].length).trim() : text,
        done: checkbox[1] !== ' ',
        isCommit: previous === COMMIT_MARKER,
        phase,
        numbered: idMatch !== null
      })
    }
    if (trimmed) previous = trimmed
  }

  // Plans number their tasks (`Task N:`); other checklists (Definition of Done, …) do not count
  // when numbered tasks exist.
  const numbered = candidates.some((task) => task.numbered)
  const tasks: PlanTask[] = candidates
    .filter((task) => !numbered || task.numbered)
    .map(({ numbered: _numbered, ...task }) => task)

  return {
    path,
    kind,
    title,
    branch,
    tasks,
    done: tasks.filter((task) => task.done).length,
    total: tasks.length,
    milestones,
    archived: frontmatterArchived(lines) || markdown.includes('<!-- aif:archived:')
  }
}

/** One direct child of the plans directory, as the worker saw it. */
export interface PlansDirEntry {
  name: string
  isDir: boolean
  /** Directories only: ultra markers in its `index.md`; undefined when it has no `index.md`. */
  ultraMarkers?: number
}

export interface DiscoverInput {
  /** Current git branch, or null. */
  branch: string | null
  config: AifConfig
  entries: PlansDirEntry[]
  fastPlanExists: boolean
  fixPlanExists: boolean
}

export interface DiscoveredPlan {
  /** Plan entrypoint relative to the workspace root (`…/index.md` for ultra). */
  path: string
  kind: PlanKind
}

export interface DiscoveryResult {
  plan: DiscoveredPlan | null
  reason: PlanDiscoveryReason
  /** Entrypoints to choose from when `reason` is `ambiguous`. */
  candidates: string[]
  /** Bundles skipped as malformed (several ultra markers), as `/aif-implement` skips them. */
  warnings: string[]
}

function joinRel(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`
}

function isUnder(path: string, dir: string): boolean {
  const base = dir.replace(/\/+$/, '')
  return path === base || path.startsWith(`${base}/`)
}

/** Finds the active plan: explicit branch artifact → single named → fast plan → fix plan. */
export function discoverPlan(input: DiscoverInput): DiscoveryResult {
  const { config, entries } = input
  const plansDir = config.paths.plans
  const active = entries.filter((entry) => !isUnder(joinRel(plansDir, entry.name), config.paths.archive))
  const ultraPath = (name: string): string => joinRel(joinRel(plansDir, name), 'index.md')
  const warnings = active
    .filter((entry) => entry.isDir && (entry.ultraMarkers ?? 0) > 1)
    .map((entry) => `${ultraPath(entry.name)} has ${entry.ultraMarkers} ultra markers; expected exactly one, skipped`)
  const result = (plan: DiscoveredPlan | null, reason: PlanDiscoveryReason, candidates: string[] = []): DiscoveryResult => ({
    plan,
    reason,
    candidates,
    warnings
  })

  // 1. Branch-based full/ultra artifact.
  if (config.git.enabled && input.branch) {
    const stem = input.branch.replace(/\//g, '-')
    if (config.planIdFormat === 'sequential') {
      const pattern = new RegExp(`^(\\d{4})_${escapeRegExp(stem)}(\\.md)?$`)
      let best: { prefix: number; entry: PlansDirEntry } | null = null
      for (const entry of active) {
        const match = pattern.exec(entry.name)
        if (!match || entry.isDir === Boolean(match[2])) continue
        if (entry.isDir && entry.ultraMarkers !== 1) continue
        const prefix = Number(match[1])
        if (!best || prefix > best.prefix || (prefix === best.prefix && entry.isDir)) best = { prefix, entry }
      }
      if (best) {
        const plan: DiscoveredPlan = best.entry.isDir
          ? { path: ultraPath(best.entry.name), kind: 'ultra' }
          : { path: joinRel(plansDir, best.entry.name), kind: 'full' }
        return result(plan, 'branch')
      }
    }
    const dir = active.find((entry) => entry.isDir && entry.name === stem)
    if (dir && dir.ultraMarkers === 1) return result({ path: ultraPath(stem), kind: 'ultra' }, 'branch')
    if (active.some((entry) => !entry.isDir && entry.name === `${stem}.md`)) {
      return result({ path: joinRel(plansDir, `${stem}.md`), kind: 'full' }, 'branch')
    }
  }

  // 2. Exactly one named artifact.
  const named: DiscoveredPlan[] = []
  for (const entry of active) {
    if (entry.isDir) {
      if (entry.ultraMarkers === 1) named.push({ path: ultraPath(entry.name), kind: 'ultra' })
      continue
    }
    if (!entry.name.toLowerCase().endsWith('.md')) continue
    const path = joinRel(plansDir, entry.name)
    if (path === config.paths.plan || path === config.paths.fixPlan) continue
    named.push({ path, kind: 'full' })
  }
  if (named.length === 1) return result(named[0], 'single-named')
  if (named.length > 1) return result(null, 'ambiguous', named.map((plan) => plan.path).sort())

  // 3. Fast plan, 4. fix plan.
  if (input.fastPlanExists) return result({ path: config.paths.plan, kind: 'fast' }, 'fast')
  if (input.fixPlanExists) return result({ path: config.paths.fixPlan, kind: 'fix' }, 'fix')
  return result(null, 'none')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
