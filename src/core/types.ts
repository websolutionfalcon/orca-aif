// Shared models of the core layer. Pure data: no Orca API, no file system.

export type PlanKind = 'fast' | 'full' | 'ultra' | 'fix'

/** Artifact locations, relative to the workspace root (forward slashes, no leading `./`). */
export interface AifPaths {
  description: string
  architecture: string
  roadmap: string
  research: string
  rulesFile: string
  rules: string
  plan: string
  plans: string
  fixPlan: string
  archive: string
}

export interface AifGitConfig {
  enabled: boolean
  baseBranch: string
  createBranches: boolean
  branchPrefix: string
}

export interface AifConfig {
  paths: AifPaths
  git: AifGitConfig
  planIdFormat: 'slug' | 'sequential'
  artifactsLanguage: string
  /** Problems found while reading config.yaml; the caller logs them. */
  warnings: string[]
}

export interface PlanTask {
  /** `N` from `Task N:`, or null when the line has no task number. */
  id: number | null
  title: string
  done: boolean
  /** The line right above is `<!-- aif:task-kind:commit -->`. */
  isCommit: boolean
  /** Nearest `### …` heading above the task, or null. */
  phase: string | null
}

export interface PlanInfo {
  /** Path relative to the workspace root. */
  path: string
  kind: PlanKind
  title: string | null
  branch: string | null
  tasks: PlanTask[]
  done: number
  total: number
  /** `Milestone:` followed by every `Also completes:` value, in order; "none" is dropped. */
  milestones: string[]
  archived: boolean
}

export type PlanDiscoveryReason = 'branch' | 'single-named' | 'fast' | 'fix' | 'none' | 'ambiguous'

export interface Milestone {
  name: string
  description: string
  done: boolean
}

export interface RoadmapInfo {
  path: string
  milestones: Milestone[]
  done: number
  total: number
  next: Milestone | null
}

export type ArtifactKey = 'config' | 'description' | 'architecture' | 'roadmap' | 'rulesFile' | 'rules'

export interface ArtifactEntry {
  key: ArtifactKey
  /** Path relative to the workspace root. */
  path: string
  exists: boolean
}

export interface WorkspaceRef {
  id: string
  name: string
  branch: string | null
  /** Absolute path on the Orca host, or null when Orca did not give one. */
  path: string | null
  /** `local`, `ssh:…`, `runtime:…`, or null. */
  hostId: string | null
}

/** Everything a ready status shows, whatever the plan state is. */
export interface ReadyStatus {
  workspace: WorkspaceRef
  artifacts: ArtifactEntry[]
  plan: PlanInfo | null
  planReason: PlanDiscoveryReason
  /** Plan paths to choose from when discovery is ambiguous. */
  candidates: string[]
  roadmap: RoadmapInfo | null
  /** Agent ids from `.ai-factory.json` (`claude`, `codex`, …). */
  installedAgents: string[]
  warnings: string[]
}

export type AifStatus =
  | { kind: 'no-workspace' }
  | { kind: 'remote'; workspace: WorkspaceRef }
  | { kind: 'not-installed'; workspace: WorkspaceRef }
  | { kind: 'error'; workspace: WorkspaceRef | null; message: string }
  | ({ kind: 'no-plan' | 'ambiguous' | 'in-progress' | 'done' } & ReadyStatus)

export type AifStatusKind = AifStatus['kind']

export type AifCommandId =
  | 'setup'
  | 'warmup'
  | 'explore'
  | 'roadmap'
  | 'plan'
  | 'improve'
  | 'implement'
  | 'verify'
  | 'review'
  | 'commit'
  | 'fix'
  | 'docs'
