// Parses ROADMAP.md: `- [ ] **Name** — description` milestones (format of /aif-roadmap).
import type { Milestone, RoadmapInfo } from './types.ts'

const MILESTONE = /^\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/
const BOLD_NAME = /^\*\*(.+?)\*\*\s*(?:[—–-]\s*(.*))?$/

export function parseRoadmap(markdown: string, path: string): RoadmapInfo {
  const milestones: Milestone[] = []
  let inFence = false
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = MILESTONE.exec(line)
    if (!match) continue
    const bold = BOLD_NAME.exec(match[2])
    milestones.push({
      name: (bold ? bold[1] : match[2]).trim(),
      description: (bold?.[2] ?? '').trim(),
      done: match[1] !== ' '
    })
  }
  const done = milestones.filter((milestone) => milestone.done).length
  return {
    path,
    milestones,
    done,
    total: milestones.length,
    next: milestones.find((milestone) => !milestone.done) ?? null
  }
}
