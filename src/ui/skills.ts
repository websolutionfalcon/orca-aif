// Skills library search for the panel. Kept in ui: the panel imports only types from core.
import type { SkillInfo } from '../core/types.ts'

/** Case-insensitive search: every word of the query must appear in the name or description. */
export function filterSkills(skills: readonly SkillInfo[], query: string): SkillInfo[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...skills]
  return skills.filter((skill) => {
    const haystack = `${skill.name} ${skill.description}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}
