---
name: merged
description: After a branch's pull request has merged, switch to the default branch, pull, delete the branch, and offer to update the submodule pointer in the host repo.
argument-hint: "[repo] [branch]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(gh pr list *)
  - Bash(gh repo view *)
---

# /git:merged

Arguments: `$ARGUMENTS`. A token that isn't a repo is the branch name `B`; if no branch is given, `B` is the current branch.

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4. A candidate repo is one whose current branch (or `B`) is not its default branch.
2. If `B` is the default branch, stop: "<repo> is already on <D>. Name the branch: `/git:merged <repo> <branch>`."
3. If the repo has uncommitted changes (`git -C "<R>" status --porcelain --ignore-submodules=dirty` isn't empty), stop and list them.
4. Check that `B` has merged (procedure step 7). If it hasn't, stop and say why: no merged PR, or commits added after the merge.
5. `git -C "<R>" switch <D>`, then `git -C "<R>" pull --ff-only`. If the pull fails, stop and report.
6. Delete the branch with `git -C "<R>" branch -D <B>`. `-D` is needed because git doesn't recognise squash merges; step 4 has already shown it's merged. Then `git -C "<R>" remote prune origin`.
7. **Submodule pointer.** Run `git -C "<R>" rev-parse --show-superproject-working-tree`. If it prints a path `H`, the repo is a submodule of `H`:
   1. Work out the submodule path `P` of `R` inside `H`. Compare the pointer `H` records (`git -C "<H>" ls-tree HEAD <P>`, the third field) with `git -C "<R>" rev-parse HEAD`.
   2. If they differ, ask with AskUserQuestion: "Update <P>'s pointer in <host name> now?". Options: "Start the pointer branch" (recommended) and "Not now".
   3. On yes, work in `H` and load `H`'s rules (procedure step 3 with `R` = `H`). Make a work branch (procedure step 5; the type is normally `chore`). Then stage only the pointer with `git -C "<H>" add <P>` and commit it (procedure step 6). Other changes in `H` stay as they are. Don't push: say that `/git:publish-committed <host>` publishes it.
   4. This only finds the host this checkout sits in. Other clones of the host aren't touched.
8. Report: the branch deleted, the commit `D` is now at, and what happened with the pointer.
