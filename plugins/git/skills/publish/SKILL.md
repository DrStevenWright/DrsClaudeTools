---
name: publish
description: Stage and commit every change in the target repo, push the branch, and open or update its pull request.
argument-hint: "[repo] [-- hint]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(gh pr *)
  - Bash(gh repo view *)
---

# /git:publish

Arguments: `$ARGUMENTS`

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4. A candidate repo is one with changes to commit, or with a branch that has commits not yet pushed or no PR yet.
2. Make sure there is a work branch (procedure step 5).
3. If there are changes: stage everything with `git -C "<R>" add -A` (unless the repo's rules say otherwise), then commit (procedure step 6). If there are none, go on with the commits already there.
4. If the branch has no commits ahead of `origin/<D>`, stop: "Nothing to publish on <branch>."
5. Push and open or update the PR (procedure step 8).
6. Report (procedure step 9), counting the whole branch (`git -C "<R>" diff --raw origin/<D>...HEAD`), with the PR link.
