# git

Claude Code allows us to do so much more, which usually entails working on several things at the same time, often across multiple Git repositories. As a result, it can become difficult to keep on top of what changes are where and in what state, and what sequence of Git commands you need to run. Mistakes are inevitable.

The DRS git plugin seeks to alleviate some of that pain, by applying a little AI-assistance to automatically work out what combination of repo, branch and changes are being targeted, and what operations are needed to get them published, while following the project's conventions for commits, pull requests and merging.

This plugin contains a set of AI-assisted slash commands for some common Git operations, accessible via prompt, context menu or a dedicated Git tools GUI.

![The Git tools pane, showing a host repo and two submodules, each with its branch, changes and buttons](docs/git-tools-pane.png)

## Commands

> **The `git:` prefix is optional** unless another plugin, skill or project command uses the same name for a command. For example, `/stage` runs `/git:stage` if nothing else is called `stage`. Use the full name to be sure, and when the typeahead lists more than one match. The pane and the right-click menu always use the full name.

The following commands obey the target repo's own workflow rules, on top of a set of generic defaults.

| Command | What it does |
| --- | --- |
| `/git:stage [repo]` | Stages all changes, including untracked files and submodule pointers. |
| `/git:commit [repo] [-- hint]` | Stages and commits all changes, creating a work branch first if needed. |
| `/git:commit-staged [repo] [-- hint]` | Commits only those changes that are already staged. |
| `/git:publish [repo] [-- hint]` | Stages, commits, and pushes all changes, then opens or updates a PR. (New PRs will be automatically opened in the browser). |
| `/git:publish-committed [repo] [-- hint]` | Pushes only changes that have already been committed, then opens or updates a PR. (New PRs will be automatically opened in the browser). |
| `/git:merged [repo] [branch]` | Call this after a PR has been merged, to switch back to the default branch (or a pre-split branch), pull latest and delete the merged branch. For submodules, it then offers to update the pointer in the host repo. |
| `/git:split-commits [repo] [-- hint]` | Suggests options for splitting off smaller sets of changes into their own branch. The remaining changes will be temporarily parked before switching to the new branch. |
| `/git:split-resume [repo]` | Returns from a split branch to the previous one and restores the parked edits. (The `/git:merged` command does this automatically.) |
| `/git:prune [repo]` | Deletes any local branches whose PRs have been merged (including those that used a squash merge). |

Claude never runs these on its own. They run only when you enter them into a prompt, select them from the context menu or press a button on the [Git tools pane](#git-tools-pane).

## Repository selection

Unless a specific repository is specified via the `repo` argument, a command looks at the session's repository and its submodules and acts on the one with relevant changes. If several qualify, it asks you to choose one. `repo` can be a path or a submodule name, such as `/git:commit DrsFramework`. Any text after `--` guides the commit or PR wording.

## Branch selection

The commands never commit to the default branch. On the default branch (or on a detached HEAD), `/git:commit` and `/git:publish` fork branches of the form `<type>/<kebab-description>` from the remote default branch (with `--no-track`). The first push then makes the branch track its own remote branch. If there is an existing unmerged branch, then this will be reused. If the existing branch's changes look unrelated to the work in progress, the user will be asked to confirm.

## Splitting commits

Sometimes local changes can end up encompassing far more than was originally intended. This can lead to large commits and/or PRs that cover multiple items that would be better split into smaller, more meaningful, more manageable changes. The `/git:split-commits` command looks at the current local changes and suggests ways in which the edits may be divided up. Only one split at a time is suggested, and only splits whose edits apply to the remote default branch on their own. Once a split is selected/confirmed the command:

1. parks every other edit on the current branch into a single `park:` commit.
2. creates the new branch from the remote default branch and switches to it, with the split edits left unstaged.

Then you are free to work in the new branch as normal. There are then two ways to return to the previous branch:

- `/git:merged`: Call this after the split branch has been merged. Instead of switching back to the default branch, it will return to the previous branch, update it and restore the parked edits. Any uncommitted edits on the split branch come back with you.
- `/git:split-resume`: If you choose not to merge the split branch just yet (or at all), then this command will return to the previous branch and restore the parked edits without deleting the split branch. Any uncommitted edits on the split branch come back with you, so commit any you want to keep on it first.

Every `/git:` command will refuse to work on a parked branch, and a session start will inform you if there are any parked edits to be resolved. If you switch branches manually, you can call `/git:split-resume` to restore the parked edits. Until then, `refs/drs-split/<branch>` keeps a backup of every edit as it was before the split.

## Git tools pane

`/git-pane` opens the Git tools pane beside the chat. It shows the session's repository and each of its submodules, along with:

- **Status line for each repository**, with the branch name (or `detached`), how many files have changed, whether the only change is a submodule pointer, and how many commits are still to publish. A split branch is tagged `split from <branch>`. Underneath, a work branch with a PR gets a link to it and the PR's state (open, merged or closed).
- **Warning** for a submodule pointer whose commit isn't on that submodule's default branch, naming the branch it is on instead. A submodule's default branch is the one `.gitmodules` tracks (`branch = …`), or else the remote's default branch as pointed to by `origin/HEAD`.
- **Buttons** for Stage, Commit, Publish, Merged, Split and Resume split. Ones that don't apply are greyed out, and pressing the button will explain why. On a branch with parked edits, only the Resume split button applies.

Each button runs its `/git:` command for that repo, as if you'd typed it into the prompt. The pane refreshes after every turn and every 15 seconds while it is shown.

In Claude's desktop app, the right-click menu provides an option to open the tools pane ("Open Git tools"). If the pane is currently closed, then it lists every available command along with a one-line description of what it does. While the pane is open, the menu includes only the commands that the pane has no button for (e.g. `/git:prune`).

## Workflow rules

The plugin's default rules are in [`shared/defaults.md`](shared/defaults.md), detailing conventions for branch names, commit descriptions, PR titles and descriptions, merge policies and safety rules (e.g. no force-push, `--ff-only` pulls).

A repository can add its own rules by linking a git workflow document from its `CLAUDE.md`, for example ``Follow [`Docs/GitWorkflow.md`](Docs/GitWorkflow.md)``. Project-specific workflows will override the default rules wherever they differ. However, it is advised that a project's GitWorkflow.md should not assume the existence of this plugin. Its rules should stand alone without depending on the defaults. Workflow documents can also state, in plain prose:

- how to choose a repository when several have changes
- checks to run before committing or publishing
- extra PR description sections
- custom base branches or staging rules

## Prerequisites

- `git` and `bash` (Git Bash on Windows).
- `gh`, signed in (`gh auth login`) - needed for `publish`, `publish-committed`, `merged` and `prune`, and for squash-merge detection.

## Installation

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
