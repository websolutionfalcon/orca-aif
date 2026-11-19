// The plugin's worker: Orca transpiles this file when it loads it (no build step).
import type { OrcaWorkerApi } from 'orca/worker'

const VERSION = '0.1.0'

export default function activate(orca: OrcaWorkerApi): void {
  orca.log(`[aif] activated v${VERSION}`)
}
