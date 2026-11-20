// Runs the `orca` CLI from the worker for what the host API cannot do: showing this plugin's own
// panel tab (`orca plugin open <key> --panel <id>`). No shell: arguments reach the CLI as written.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const TIMEOUT_MS = 10_000
export const PLUGIN_ID = 'ai-factory'
export const PANEL_ID = 'aif'

export type CliRunner = (args: readonly string[], timeoutMs?: number) => Promise<unknown>

/** The CLI inside the Orca app running this worker; `orca` on the PATH otherwise. */
export function orcaCliPath(): string {
  const candidates: string[] = []
  if (process.resourcesPath) candidates.push(join(process.resourcesPath, 'bin', 'orca'))
  const app = /^(.*?\.app)\//.exec(process.execPath)?.[1]
  if (app) candidates.push(join(app, 'Contents', 'Resources', 'bin', 'orca'))
  return candidates.find((path) => existsSync(path)) ?? 'orca'
}

/** `{ ok, result }` → result; `{ ok: false, error }` → throws its message. */
export function parseCliOutput(stdout: string): unknown {
  let answer: { ok?: unknown; result?: unknown; error?: { message?: unknown } }
  try {
    answer = JSON.parse(stdout)
  } catch {
    throw new Error('the orca CLI did not answer with JSON')
  }
  if (answer?.ok !== true) {
    const message = answer?.error?.message
    throw new Error(typeof message === 'string' ? message : 'the orca CLI reported a failure')
  }
  return answer.result
}

export const runOrcaCli: CliRunner = (args, timeoutMs = TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    execFile(orcaCliPath(), [...args, '--json'], { timeout: timeoutMs }, (error, stdout) => {
      try {
        resolve(parseCliOutput(stdout))
      } catch (parseError) {
        reject(stdout.trim() ? parseError : (error ?? parseError))
      }
    })
  })

/**
 * This plugin's key from where its worker file lives: installed plugins sit in
 * `…/orca/plugins/<publisher>.<id>/<content-hash>/…`; anything else is a development folder,
 * which Orca names `local.<id>`.
 */
export function pluginKeyFromLocation(workerUrl: string): string {
  const path = decodeURIComponent(workerUrl.replace(/^file:\/\//, '')).replace(/\\/g, '/')
  const match = /\/orca\/plugins\/([^/]+\.[^/]+)\//.exec(path)
  return match ? match[1] : `local.${PLUGIN_ID}`
}

/** Shows this plugin's panel tab in the right sidebar, opening the sidebar if it is closed. */
export async function openOwnPanel(run: CliRunner, pluginKey: string): Promise<void> {
  await run(['plugin', 'open', pluginKey, '--panel', PANEL_ID])
}
