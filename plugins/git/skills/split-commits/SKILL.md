---
name: split-commits
description: Split some of the uncommitted edits off onto a new branch from the default branch, parking the rest on the current branch until you return.
argument-hint: "[repo] [-- hint]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(bash *split.sh*)
  - Bash(gh pr list *)
  - Bash(gh repo view *)
---

# /git:split-commits

Arguments: `$ARGUMENTS`. The hint, if any, says what to split off.

`S` below is `bash "${CLAUDE_PLUGIN_ROOT}/scripts/split.sh"`. It does every step that changes files, branches or the index; never do those steps with other commands.

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4. A candidate repo is one with uncommitted changes, on a branch other than its default.
2. Let `P` be the current branch. Stop if:
   - HEAD is detached or on `D`: "<repo> has no work branch to split from. Use `/git:commit` to start one."
   - `P` is a split branch (`branch.<P>.splitFrom` is set): "<P> is a split branch. Finish or `/git:split-resume` first."
   - `P`'s PR has merged (procedure step 7): suggest `/git:merged`.
3. Run `S prepare "<R>"`. It prints the path of a patch of every uncommitted edit (staged, unstaged and untracked) against HEAD, then the `--raw` list. Read the patch.
4. Find up to four ways to split off **one** coherent change: files or hunks that belong together and could stand as their own commit and PR. Never include submodule pointers. Prefer changes that don't depend on the branch's commits.
   - For each, run `S pick "<R>" c<n> <spec>...`, where each spec is a file path for the whole file or `<path>:<n>,<n>` for some of its hunks, numbered from 1 within that file. Then run `S check "<R>" <printed path> <D>`.
   - Keep only the candidates whose check prints `ok`. A failing check means the change depends on work not on `origin/<D>`.
   - None left → stop: "Nothing in <repo> can be split off onto <D> on its own." Change nothing.
5. Ask with AskUserQuestion, one option per candidate, labelled with its branch name and file count, e.g. `fix/xr-config · 2 files`, the description saying in a few words which edits it takes. Name each branch by the rules (`<type>/<kebab>`). Ask even when there is only one.
6. Run `S split "<R>" <chosen patch> <D> <branch>`. It parks the remaining edits on `P` in one commit, creates the branch from `origin/<D>` without tracking, switches to it and leaves the split edits there unstaged. On failure, report its message and stop; it prints how to recover.
7. If a submodule's checkout now differs from the new branch's pointer, say so on a second line: `<path> checkout differs from its pointer here; it stays out of this branch's commits`.
8. Report in one line: `<repo> · <branch> (new, split from <P>) · <counts from the script> · rest parked on <P>` (or `· nothing left on <P>` when the script prints `parked: no`).

Don't commit the split edits or push.
