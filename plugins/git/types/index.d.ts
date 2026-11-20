// What the git pane keeps in the session's state.

export type GitRepo = {
  /** The repo's top-level path, as git prints it. */
  path: string
  /** The repo argument the pane passes to the /git: commands. */
  arg: string
  name: string
  /** The current branch; null for a detached HEAD. */
  branch: string | null
  defaultBranch: string
  /** Files with changes (staged, unstaged or untracked). */
  changed: number
  /** True when every change is a submodule pointer. */
  isPointerOnly: boolean
  /** Commits on the branch that aren't on origin/<default>. */
  ahead: number
  /** The branch has edits parked by /git:split-commits. */
  isParked: boolean
  /** The branch a split branch came from; null otherwise. */
  splitFrom: string | null
  warnings: string[]
}

declare module 'claude-code' {
  interface PluginState {
    git: {
      repos: Shaped<GitRepo[]>
      busy: string
      problem: string
    }
  }
}
