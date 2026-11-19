---
name: commit-staged
description: Commit only what is already staged in the target repo, leaving unstaged and untracked files alone.
argument-hint: "[repo] [-- hint]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(gh pr list *)
  - Bash(gh repo view *)
---

# /git:commit-staged

Arguments: `$ARGUMENTS`

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4. A candidate repo is one with staged changes (`git -C "<repo>" diff --cached --quiet` fails).
2. If nothing is staged, stop: "Nothing is staged in <repo>."
3. Make sure there is a work branch (procedure step 5). Switching carries the index over unchanged.
4. Commit (procedure step 6). Don't stage anything.
5. Report (procedure step 9), listing the unstaged and untracked files that were left out.

Don't push or open a PR.
