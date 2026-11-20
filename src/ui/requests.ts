// Inputs for the panel's worker requests. Orca validates request input as JSON, so optional fields
// are left out rather than sent as `undefined` (which it refuses with `invalid_params`).
import type { AifCommandId } from '../core/types.ts'

export function commandRunInput(
  command: AifCommandId,
  rawArgument: string | undefined,
  draft = false
): { command: AifCommandId; argument?: string; draft?: boolean } {
  const argument = rawArgument?.trim()
  return { command, ...(argument && !draft ? { argument } : {}), ...(draft ? { draft: true } : {}) }
}
