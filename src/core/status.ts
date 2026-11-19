// Assembles AifStatus from what the worker read, and turns it into the status bar item and the
// `aif.summary` text. Pure.
import { texts } from './i18n.ts'
import type { DiscoveryResult } from './plans.ts'
import { parsePlan } from './plans.ts'
import { parseRoadmap } from './roadmap.ts'
import type { AifConfig, AifStatus, ArtifactEntry, WorkspaceRef } from './types.ts'

export interface StatusInput {
  workspace: WorkspaceRef
  /** `.ai-factory/` directory or `.ai-factory.json` exists. */
  installed: boolean
  config: AifConfig
  artifacts: ArtifactEntry[]
  discovery: DiscoveryResult
  /** Text of `discovery.plan`, or null when there is no plan or it could not be read. */
  planText: string | null
  roadmapText: string | null
  /** Text of `.ai-factory.json`, or null. */
  installJson: string | null
  /** Problems the worker met while reading (file too large, outside the workspace, …). */
  warnings: string[]
}

/** Agent ids listed in `.ai-factory.json` (`agents[].id`). */
export function installedAgentsOf(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return []
    const agents = (parsed as { agents?: unknown }).agents
    if (!Array.isArray(agents)) return []
    return agents
      .map((agent: unknown) => (agent && typeof agent === 'object' ? (agent as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function buildStatus(input: StatusInput): AifStatus {
  const { workspace, discovery } = input
  if (!input.installed) return { kind: 'not-installed', workspace }
  const warnings = [...input.config.warnings, ...discovery.warnings, ...input.warnings]
  const plan = discovery.plan && input.planText !== null
    ? parsePlan(input.planText, discovery.plan.path, discovery.plan.kind)
    : null
  if (discovery.plan && input.planText === null) warnings.push(`plan ${discovery.plan.path} could not be read`)
  const roadmap = input.roadmapText !== null ? parseRoadmap(input.roadmapText, input.config.paths.roadmap) : null

  const ready = {
    workspace,
    artifacts: input.artifacts,
    plan,
    planReason: discovery.reason,
    candidates: discovery.candidates,
    roadmap,
    installedAgents: installedAgentsOf(input.installJson),
    warnings
  }
  if (discovery.reason === 'ambiguous') return { kind: 'ambiguous', ...ready }
  if (!plan) return { kind: 'no-plan', ...ready }
  if (plan.total > 0 && plan.done === plan.total) return { kind: 'done', ...ready }
  return { kind: 'in-progress', ...ready }
}

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
export type StatusIcon = 'rocket' | 'cloud' | 'error' | 'warning' | 'check' | 'play'

export interface StatusBarView {
  text: string
  tone: StatusTone
  icon: StatusIcon
  tooltip: string
  visible: boolean
}

function roadmapLine(status: AifStatus, locale: string | undefined): string | null {
  if (!('roadmap' in status) || !status.roadmap || status.roadmap.total === 0) return null
  const t = texts(locale)
  const { roadmap } = status
  const next = roadmap.next ? ` · ${t.next}: ${roadmap.next.name}` : ''
  return `${t.roadmap}: ${roadmap.done}/${roadmap.total} ${t.milestones}${next}`
}

export function statusBarOf(status: AifStatus, locale?: string): StatusBarView {
  const t = texts(locale)
  const roadmap = roadmapLine(status, locale)
  const withRoadmap = (line: string): string => (roadmap ? `${line}\n${roadmap}` : line)
  switch (status.kind) {
    case 'no-workspace':
    case 'not-installed':
      return { text: 'AIF', tone: 'neutral', icon: 'rocket', tooltip: t.name, visible: false }
    case 'remote':
      return { text: 'AIF', tone: 'neutral', icon: 'cloud', tooltip: t.remote, visible: true }
    case 'error':
      return { text: 'AIF !', tone: 'danger', icon: 'error', tooltip: `${t.error}: ${status.message}`, visible: true }
    case 'ambiguous':
      return { text: 'AIF ?', tone: 'warning', icon: 'warning', tooltip: withRoadmap(t.ambiguous), visible: true }
    case 'no-plan':
      return { text: 'AIF', tone: 'neutral', icon: 'rocket', tooltip: withRoadmap(t.noPlan), visible: true }
    case 'in-progress': {
      const plan = status.plan!
      return {
        text: `AIF ${plan.done}/${plan.total}`,
        tone: 'accent',
        icon: 'play',
        tooltip: withRoadmap(`${t.plan}: ${plan.title ?? plan.path} — ${plan.done}/${plan.total} ${t.tasks}`),
        visible: true
      }
    }
    case 'done': {
      const plan = status.plan!
      return {
        text: `AIF ✓ ${plan.done}/${plan.total}`,
        tone: 'success',
        icon: 'check',
        tooltip: withRoadmap(`${t.plan}: ${plan.title ?? plan.path} — ${t.done}`),
        visible: true
      }
    }
  }
}

/** Multi-line text for the `aif.summary` command (Orca shows a string result as is). */
export function summaryOf(status: AifStatus, locale?: string): string {
  const t = texts(locale)
  if (status.kind === 'no-workspace') return t.noWorkspace
  const header = `${t.name} — ${t.workspace}: ${status.workspace?.name ?? '?'}` +
    (status.workspace?.branch ? ` (${t.branch}: ${status.workspace.branch})` : '')
  const lines = [header]
  switch (status.kind) {
    case 'remote':
      lines.push(t.remote)
      break
    case 'not-installed':
      lines.push(t.notInstalled)
      break
    case 'error':
      lines.push(`${t.error}: ${status.message}`)
      break
    case 'ambiguous':
      lines.push(t.ambiguous, ...status.candidates.map((path) => `  • ${path}`))
      break
    case 'no-plan':
      lines.push(t.noPlan)
      break
    case 'in-progress':
    case 'done': {
      const plan = status.plan!
      lines.push(`${t.plan}: ${plan.title ?? plan.path} (${plan.kind}) — ${plan.done}/${plan.total} ${t.tasks}`)
      const next = plan.tasks.find((task) => !task.done)
      if (next) lines.push(`${t.next}: ${next.id !== null ? `Task ${next.id}: ` : ''}${next.title}`)
      else lines.push(t.done)
      break
    }
  }
  const roadmap = roadmapLine(status, locale)
  if (roadmap) lines.push(roadmap)
  return lines.join('\n')
}
