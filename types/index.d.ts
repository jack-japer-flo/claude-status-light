export type LightKind = 'working' | 'waiting' | 'idle'
export type Light = { kind: LightKind; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'status-light': { light: Light }
  }
}
