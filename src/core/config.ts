// Reads `.ai-factory/config.yaml` into AifConfig. A tiny YAML subset parser is enough: AI Factory
// writes nested mappings of scalars. Lists, anchors and multi-line scalars are skipped.
import type { AifConfig, AifPaths } from './types.ts'

export const DEFAULT_PATHS: AifPaths = {
  description: '.ai-factory/DESCRIPTION.md',
  architecture: '.ai-factory/ARCHITECTURE.md',
  roadmap: '.ai-factory/ROADMAP.md',
  research: '.ai-factory/RESEARCH.md',
  rulesFile: '.ai-factory/RULES.md',
  rules: '.ai-factory/rules/',
  plan: '.ai-factory/PLAN.md',
  plans: '.ai-factory/plans/',
  fixPlan: '.ai-factory/FIX_PLAN.md',
  archive: '.ai-factory/archive/'
}

/** config.yaml key under `paths:` for each AifPaths field. */
const PATH_KEYS: Record<keyof AifPaths, string> = {
  description: 'description',
  architecture: 'architecture',
  roadmap: 'roadmap',
  research: 'research',
  rulesFile: 'rules_file',
  rules: 'rules',
  plan: 'plan',
  plans: 'plans',
  fixPlan: 'fix_plan',
  archive: 'archive'
}

export const CONFIG_PATH = '.ai-factory/config.yaml'

type YamlMap = { [key: string]: YamlValue }
type YamlValue = string | YamlMap

/** Removes a trailing `# comment` that is outside quotes. */
function stripComment(line: string): string {
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
  }
  return line
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && (trimmed[0] === '"' || trimmed[0] === "'") && trimmed.at(-1) === trimmed[0]) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** Parses nested `key: value` mappings by indentation. */
export function parseYamlMappings(text: string): YamlMap {
  const root: YamlMap = {}
  const stack: { indent: number; map: YamlMap }[] = [{ indent: -1, map: root }]
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = stripComment(rawLine).replace(/\s+$/, '')
    if (!line.trim() || line.trim() === '---') continue
    const indent = line.length - line.trimStart().length
    const content = line.trim()
    if (content.startsWith('- ')) continue
    const match = /^([A-Za-z0-9_.-]+)\s*:(?:\s+(.*))?$/.exec(content)
    if (!match) continue
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1].map
    const key = match[1]
    const value = match[2] === undefined ? '' : unquote(match[2])
    if (value === '' || value === '|' || value === '>') {
      const child: YamlMap = {}
      parent[key] = child
      stack.push({ indent, map: child })
    } else {
      parent[key] = value
    }
  }
  return root
}

function section(map: YamlMap, key: string): YamlMap {
  const value = map[key]
  return typeof value === 'object' ? value : {}
}

function scalar(map: YamlMap, key: string): string | undefined {
  const value = map[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Normalizes a configured relative path: forward slashes, no leading `./`. */
export function normalizeRelPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^(\.\/)+/, '')
}

function isSafeRelPath(value: string): boolean {
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false
  return !value.split('/').includes('..')
}

function parseBoolean(value: string | undefined, fallback: boolean, key: string, warnings: string[]): boolean {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  warnings.push(`config: ${key}=${value} is not a boolean; using ${fallback}`)
  return fallback
}

/** Resolves config.yaml text (null when the file is missing) into AifConfig with defaults. */
export function resolveConfig(text: string | null): AifConfig {
  const warnings: string[] = []
  const yaml = text === null ? {} : parseYamlMappings(text)

  const pathsSection = section(yaml, 'paths')
  const paths = { ...DEFAULT_PATHS }
  for (const field of Object.keys(PATH_KEYS) as (keyof AifPaths)[]) {
    const raw = scalar(pathsSection, PATH_KEYS[field])
    if (raw === undefined) continue
    const normalized = normalizeRelPath(raw)
    if (!isSafeRelPath(normalized)) {
      warnings.push(`config: paths.${PATH_KEYS[field]}=${raw} leaves the workspace; using ${DEFAULT_PATHS[field]}`)
      continue
    }
    paths[field] = normalized
  }

  const git = section(yaml, 'git')
  const workflow = section(yaml, 'workflow')
  const language = section(yaml, 'language')

  const rawFormat = scalar(workflow, 'plan_id_format') ?? 'slug'
  let planIdFormat: AifConfig['planIdFormat'] = 'slug'
  if (rawFormat === 'sequential') planIdFormat = 'sequential'
  else if (!['slug', 'timestamp', 'uuid'].includes(rawFormat)) {
    warnings.push(`config: workflow.plan_id_format=${rawFormat} is unknown; using slug`)
  }

  return {
    paths,
    git: {
      enabled: parseBoolean(scalar(git, 'enabled'), true, 'git.enabled', warnings),
      baseBranch: scalar(git, 'base_branch') ?? 'main',
      createBranches: parseBoolean(scalar(git, 'create_branches'), true, 'git.create_branches', warnings),
      branchPrefix: scalar(git, 'branch_prefix') ?? 'feature/'
    },
    planIdFormat,
    artifactsLanguage: scalar(language, 'artifacts') ?? scalar(language, 'ui') ?? 'en',
    warnings
  }
}
