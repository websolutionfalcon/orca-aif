// The few Node.js APIs this plugin uses, declared locally so type-checking needs no node_modules
// inside the plugin folder (Orca loads the whole folder and refuses its symlinks and file count).
// Signatures follow @types/node; only the overloads used here are declared.

declare module 'node:fs/promises' {
  export interface Stats {
    size: number
    mtimeMs: number
    isFile(): boolean
    isDirectory(): boolean
  }
  export interface Dirent {
    name: string
    isFile(): boolean
    isDirectory(): boolean
  }
  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  export function realpath(path: string): Promise<string>
  export function stat(path: string): Promise<Stats>
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>
  export function mkdtemp(prefix: string): Promise<string>
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
  export function writeFile(path: string, data: string | Uint8Array): Promise<void>
  export function symlink(target: string, path: string): Promise<void>
}

declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}

declare module 'node:path' {
  export function isAbsolute(path: string): boolean
  export function join(...paths: string[]): string
  export function relative(from: string, to: string): string
  export function resolve(...paths: string[]): string
}

declare module 'node:os' {
  export function tmpdir(): string
}

declare module 'node:child_process' {
  export function execFile(
    file: string,
    args: readonly string[],
    options: { timeout?: number },
    callback: (error: Error | null, stdout: string, stderr: string) => void
  ): unknown
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean
}

declare const process: {
  readonly resourcesPath?: string
  readonly execPath: string
  readonly env: Record<string, string | undefined>
}
