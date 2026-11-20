// AI Factory skills installed in the project: SKILL.md frontmatter parsing, the skills folders
// of each agent and the search the panel's Skills library uses. Pure.
import type { SkillInfo } from './types.ts'

/** Where agents keep skills when `.ai-factory.json` does not say (Claude, Codex, universal). */
export const DEFAULT_SKILL_DIRS = ['.claude/skills', '.agents/skills', '.codex/skills']
export const MAX_DESCRIPTION_LENGTH = 600

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && (trimmed[0] === '"' || trimmed[0] === "'") && trimmed.at(-1) === trimmed[0]) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Reads `name`, `description` and `argument-hint` from a SKILL.md frontmatter block. Supports
 * plain, quoted and block (`>`, `>-`, `|`, `|-`) scalars. Returns null without a usable name.
 */
export function parseSkillFile(text: string, path: string): SkillInfo | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') return null
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return null
  const fields: Record<string, string> = {}
  for (let i = 1; i < end; i++) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i])
    if (!match) continue
    const [, key, raw] = match
    if (/^[>|][-+]?$/.test(raw.trim())) {
      const block: string[] = []
      while (i + 1 < end && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) block.push(lines[++i].trim())
      fields[key] = raw.trim().startsWith('|') ? block.join('\n').trim() : block.filter(Boolean).join(' ')
    } else {
      fields[key] = unquote(raw)
    }
  }
  const name = fields.name?.trim()
  if (!name) return null
  const description = (fields.description ?? '').replace(/\s+/g, ' ').trim()
  return {
    name,
    description: description.length > MAX_DESCRIPTION_LENGTH ? `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…` : description,
    argumentHint: fields['argument-hint']?.trim() || null,
    path
  }
}

/** AI Factory's own skills: `aif` and `aif-*`. */
export function isAifSkill(name: string): boolean {
  return /^aif(-|$)/.test(name)
}

/** Skills folders named in `.ai-factory.json` (`agents[].skillsDir`), else the defaults. */
export function skillDirsOf(installJson: string | null): string[] {
  if (installJson) {
    try {
      const parsed = JSON.parse(installJson) as { agents?: { skillsDir?: unknown }[] }
      const dirs = (parsed.agents ?? [])
        .map((agent) => agent?.skillsDir)
        .filter((dir): dir is string => typeof dir === 'string' && dir.length > 0)
        .map((dir) => dir.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, ''))
        .filter((dir) => !dir.startsWith('/') && !/^[A-Za-z]:/.test(dir) && !dir.split('/').includes('..'))
      if (dirs.length > 0) return [...new Set(dirs)]
    } catch {
      // Fall through to the defaults.
    }
  }
  return DEFAULT_SKILL_DIRS
}
