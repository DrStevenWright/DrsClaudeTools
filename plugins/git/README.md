# git

Slash commands that stage, commit, publish and tidy up git branches. They follow each repo's own workflow rules, on top of a set of generic defaults.

| Command | What it does |
| --- | --- |
| `/git:stage [repo]` | Stages every change, including untracked files and submodule pointers. |
| `/git:commit [repo] [-- hint]` | Stages everything and commits, creating a work branch first if needed. |
| `/git:commit-staged [repo] [-- hint]` | Commits only what is already staged. |
| `/git:publish [repo] [-- hint]` | Stages, commits, pushes and opens or updates the PR. A new PR opens in the browser. |
| `/git:publish-committed [repo] [-- hint]` | Pushes existing commits and opens or updates the PR, without committing. A new PR opens in the browser. |
| `/git:merged [repo] [branch]` | After a PR merges: switches to the default branch, pulls and deletes the branch. In a submodule, it then offers to update the pointer in the host repo. |
| `/git:split-commits [repo] [-- hint]` | Offers ways to split one change off the uncommitted edits onto a new branch from the default branch. Parks the rest on the current branch and switches to the new one. |
| `/git:split-resume [repo]` | Returns from a split branch to the branch it came from and restores the parked edits. |
| `/git:prune [repo]` | Deletes the local branches you confirm whose PRs have merged, squash merges included. |

Claude never runs these on its own. They run only when you type them or press one of [the pane](#the-pane)'s buttons.

## Which repo

With no `repo` argument, a command looks at the session's repo and its submodules and acts on the one with relevant changes. If several qualify, it asks which one. `repo` can be a path or a submodule name, such as `/git:commit DrsFramework`. Text after `--` guides the commit or PR wording.

## Branches

The commands never commit to the default branch. On the default branch or a detached HEAD, `commit` and `publish` create `<type>/<kebab-description>` from the remote default branch, with `--no-track`. The first push then makes the branch track its own remote branch. An existing unmerged branch is reused, and if the changes look unrelated to it, the command asks first.

## Splitting

`/git:split-commits` offers only splits whose edits apply to the remote default branch on their own, one split per run. On a pick, it:

1. parks every other edit on the current branch in a single `park:` commit (staged and unstaged together);
2. creates the new branch from the remote default branch and switches to it, with the split edits unstaged.

Build, test and publish the new branch as usual. Then return with either:

- `/git:merged`, after its PR merges: back to the previous branch, edits restored, the default branch merged in;
- `/git:split-resume`, without merging: back to the previous branch, edits restored.

Every `/git:` command refuses to work on a parked branch, and a session start says when edits are parked. If you switch back by hand, `/git:split-resume` (or `git reset HEAD~1` on the park commit) restores them. Until they are restored, `refs/drs-split/<branch>` keeps a backup of every edit as it was before the split. Submodule pointers always stay behind, and the commands don't stage them on a split branch.

## The pane

`/git-pane` opens the Git tools pane beside the chat. It shows the session's repo and each of its submodules:

- **A line for each repo**, with the branch (or `detached`), how many files have changed, whether the only change is a submodule pointer, and how many commits are still to publish. A split branch is tagged `split from <branch>`.
- **A warning** for a submodule pointer whose commit isn't on that submodule's default branch, naming the branch it is on. A submodule's default branch is the one `.gitmodules` tracks (`branch = …`), or else its remote's.
- **Buttons** for Stage, Commit, Publish, Merged, Split and Resume split. Ones that don't apply are greyed out, and pressing one says why. On a branch with parked edits, only Resume split applies.

Each button runs its `/git:` command for that repo, as if you'd typed it, so the command's rules and judgement apply. The pane refreshes after every turn and every 15 seconds while it's shown.

In the desktop app, the right-click menu has Open Git tools, plus every command with a one-line description while the pane is closed. While it's open, the menu has just the commands the pane has no button for: Commit staged, Publish committed and Prune merged branches. Commands from the menu choose their repo the way a typed command does. The pane's footer shows the installed version.

## Rules

The plugin's defaults are in [`shared/defaults.md`](shared/defaults.md): Conventional Commits, branch names, PR title and description, and safety rules (no force-push, `--ff-only` pulls).

A repo adds its own rules by linking a git workflow document from its `CLAUDE.md`, for example ``Follow [`Docs/GitWorkflow.md`](Docs/GitWorkflow.md)``. That document overrides the defaults where they differ. It doesn't need to mention this plugin and should stand on its own. It can also say, in plain prose:

- how to choose a repo when several have changes;
- checks to run before committing or publishing;
- extra PR description sections;
- a different base branch or staging rule.

## Requirements

- `git` and `bash` (Git Bash on Windows).
- `gh`, signed in (`gh auth login`), for `publish`, `publish-committed`, `merged` and `prune`, and for squash-merge detection.

## Installing

Install for every repo (user scope):

```
claude plugin install git@drs-claude-tools --scope user
```

Or for one project only, shared with its collaborators through `.claude/settings.json`:

```
claude plugin install git@drs-claude-tools --scope project
```

See the [marketplace README](../../README.md) for adding the marketplace.

The commands are allowed to run `git` and `gh` without asking while they run. To block force-pushes in all cases, add `Bash(git push --force*)` and `Bash(git push -f*)` to `permissions.deny` in your settings.
