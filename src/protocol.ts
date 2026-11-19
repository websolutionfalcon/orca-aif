// The panel <-> worker contract, declared once: the worker (src/worker.ts) and the panel scripts
// (src/ui/*) both read it. Filled in with the real requests in a later task.
export {}

declare module 'orca' {
  interface PluginRequests {}
  interface PluginPanelEvents {}
}
