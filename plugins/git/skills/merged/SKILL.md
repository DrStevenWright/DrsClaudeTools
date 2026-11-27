---
name: merged
description: After a branch's pull request has merged, switch to the default branch (or back to the branch it was split from), pull, delete the branch, and offer to update the submodule pointer in the host repo.
argument-hint: "[repo] [branch]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(bash *split.sh*)
  - Bash(gh pr list *)
  - Bash(gh repo view *)
---

# /git:merged

Arguments: `$ARGUMENTS`. A token that isn't a repo is the branch name `B`; if no branch is given, `B` is the current branch.

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4. A candidate repo is one whose current branch (or `B`) is not its default branch. Skip the parked-edits stop in step 2 when `B` is a split branch (step 3).
2. If `B` is the default branch, stop: "<repo> is already on <D>. Name the branch: `/git:merged <repo> <branch>`."
3. **Split branch.** If `git -C "<R>" config --get branch.<B>.splitFrom` prints a branch `F`, `B` came from `/git:split-commits`:
   1. If HEAD is on neither `B` nor `F`, stop: "Switch to <B> or <F> first." Uncommitted changes are fine on either: on `B` they come back to `F`.
   2. Check that `B` has merged, as in step 5.
   3. Update the local default branch without switching to it: `git -C "<R>" fetch origin <D>:<D>`. If it isn't a fast-forward, say so and carry on.
   4. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/split.sh" return "<R>" <B> <D>`. It switches to `F`, restores the parked edits and merges `origin/<D>` into `F`, holding the edits aside during the merge, then restores any uncommitted changes carried from `B`. If it stops, report its message and stop.
   5. Delete `B` as in step 7. Skip step 8: the repo is back on `F`, so any host pointer waits for `F`.
   6. Report in one line: `<repo> · deleted <B> · back on <F> · <the script's "restored" line, without the prefix> · merged origin/<D>` (or `· already up to date` if it printed that), adding `· carried changes from <B>` if it printed `carried: yes`. Then stop.
4. If the repo has uncommitted changes (`git -C "<R>" status --porcelain --ignore-submodules=dirty` isn't empty), stop and list them.
5. Check that `B` has merged (procedure step 7). If it hasn't, stop and say why: no merged PR, or commits added after the merge.
6. `git -C "<R>" switch <D>`, then `git -C "<R>" pull --ff-only`. If the pull fails, stop and report.
7. Delete the branch with `git -C "<R>" branch -D <B>`. `-D` is needed because git doesn't recognise squash merges; step 5 has already shown it's merged. Then `git -C "<R>" remote prune origin`.
8. **Submodule pointer.** Run `git -C "<R>" rev-parse --show-superproject-working-tree`. If it prints a path `H`, the repo is a submodule of `H`:
   1. Work out the submodule path `P` of `R` inside `H`. Compare the pointer `H` records (`git -C "<H>" ls-tree HEAD <P>`, the third field) with `git -C "<R>" rev-parse HEAD`.
   2. If they differ, ask with AskUserQuestion: "Update <P>'s pointer in <host name> now?". Options: "Start the pointer branch" (recommended) and "Not now".
   3. On yes, work in `H` and load `H`'s rules (procedure step 3 with `R` = `H`). Make a work branch (procedure step 5; the type is normally `chore`). Then stage only the pointer with `git -C "<H>" add <P>` and commit it (procedure step 6). Other changes in `H` stay as they are. Don't push: say that `/git:publish-committed <host>` publishes it.
   4. This only finds the host this checkout sits in. Other clones of the host aren't touched.
9. Report in one line, with no other commentary: `<repo> · deleted <B> · <D> at <short sha>`, plus `· pointer branch <name> in <host>` or `· pointer already current` where step 8 applied.
