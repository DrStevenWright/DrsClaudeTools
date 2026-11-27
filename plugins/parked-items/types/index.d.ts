/** A piece of follow-up work parked from a chat. */
export type ParkedPoint = {
  id: string
  title: string
  notes: string
  status: 'open' | 'closed'
  /** When it was parked, in ms since the epoch. */
  parkedAt: number
  closedAt?: number
  /** The chat it was parked from. */
  from: ParkedFrom
}

export type ParkedFrom = {
  sessionId: string
  /** The session's project folder, absolute. */
  projectPath: string
  /** The folder's name, shown as the project. */
  project: string
  /** Where it came from, in the person's words; empty when they left the From box blank. */
  chat: string
}

/** A suggestion Claude makes for what to park. */
export type ParkCandidate = { title: string; notes: string }

/** The park dialog, while it is open. */
export type ParkDraft = {
  /** Names the latest Suggest, so an older answer arriving late is ignored. */
  token: string
  /** Where Claude's suggestions stand: none asked for yet, on the way, back, or failed. */
  status: 'idle' | 'loading' | 'ready' | 'failed'
  failure?: string
  candidates: ParkCandidate[]
  title: string
  notes: string
  /** What the empty Notes box says; absent for the usual "Optional details". */
  notesPlaceholder?: string
  /** The notes as a suggestion last filled them, so the next suggestion picked may replace them. */
  suggestedNotes?: string
  /** The From box: where the point came from, in the person's words. Starts as the chat's first words. */
  fromLabel: string
  from: ParkedFrom
}

export type ParkedView = {
  tab: 'open' | 'closed'
  draft?: ParkDraft
  editing?: { id: string; title: string; notes: string; chat: string }
  confirmDelete?: string
}

declare module 'claude-code' {
  interface PluginState {
    'parked-items': {
      points: Shaped<ParkedPoint[]>
      view: Shaped<ParkedView>
      /** Whether the Parked items pane is open; the reminder line hides while it is. */
      isPaneOpen: boolean
    }
  }
}
