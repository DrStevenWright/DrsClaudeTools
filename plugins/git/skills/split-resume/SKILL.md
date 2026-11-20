---
name: split-resume
description: Return from a split branch to the branch it was split from and restore the edits parked there.
argument-hint: "[repo]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(bash *split.sh*)
  - Bash(gh pr list *)
  - Bash(gh repo view *)
---

# /git:split-resume

Arguments: `$ARGUMENTS`

`S` below is `bash "${CLAUDE_PLUGIN_ROOT}/scripts/split.sh"`.

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4, skipping the parked-edits stop in step 2. A candidate repo is one whose current branch `C` is a split branch (`branch.<C>.splitFrom` is set) or has parked edits (`branch.<C>.splitPark` is set).
2. **On a parked branch** (you switched back by hand): run `S resume "<R>"`. It restores the parked edits. Go to step 5.
3. **On a split branch** with uncommitted changes (`git -C "<R>" status --porcelain --ignore-submodules=dirty` isn't empty), ask with AskUserQuestion: "<n> uncommitted changes on <C>. What should happen to them?" Options:
   - "Commit them on <C>" (recommended): stage and commit them (procedure steps 5 and 6, staging as the procedure says for a split branch), then run `S resume "<R>"`.
   - "Bring them back with me": run `S resume "<R>" carry`.
4. **On a clean split branch:** run `S resume "<R>"`.
5. If the script stops, report its message in one line. Otherwise report in one line: `<repo> · <previous branch> · restored <counts from the script's "restored" line>`, adding `· carried changes from <C>` if it printed `carried: yes`.

The split branch and any PR stay as they are. After its PR merges, `/git:merged <repo> <split branch>` deletes it and brings the default branch into the previous branch.
