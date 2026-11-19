---
name: stage
description: Stage every change in the target repo, including untracked files and submodule pointers.
argument-hint: "[repo]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
---

# /git:stage

Arguments: `$ARGUMENTS`

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 3. A candidate repo is one with unstaged or untracked changes.
2. Stage everything with `git -C "<R>" add -A`, unless the repo's rules give a different staging rule.
3. Report (procedure step 9), counting `git -C "<R>" diff --cached --raw`. If there was nothing to stage, say so in one line.

Don't commit, branch or push.
