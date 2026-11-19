---
name: commit
description: Stage every change in the target repo and commit it, creating a work branch first if needed.
argument-hint: "[repo] [-- hint]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(gh pr list *)
  - Bash(gh repo view *)
---

# /git:commit

Arguments: `$ARGUMENTS`

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4. A candidate repo is one with staged, unstaged or untracked changes.
2. Make sure there is a work branch (procedure step 5).
3. Stage everything with `git -C "<R>" add -A`, unless the repo's rules give a different staging rule.
4. Commit (procedure step 6).
5. Report (procedure step 9), counting `git -C "<R>" show --raw --format= HEAD`.

Don't push or open a PR.
