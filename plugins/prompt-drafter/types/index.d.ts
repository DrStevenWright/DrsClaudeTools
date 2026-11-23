export type DraftMode = 'write' | 'preview' | 'split'

declare module 'claude-code' {
  interface PluginState {
    'prompt-drafter': {
      draft: string
      field: { text: string; gen: number }
      mode: DraftMode
      paneChanges: number
    }
  }
}
