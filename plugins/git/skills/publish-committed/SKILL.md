---
name: publish-committed
description: Push the target repo's existing commits and open or update the pull request, without staging or committing anything.
argument-hint: "[repo] [-- hint]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(gh pr *)
  - Bash(gh repo view *)
---

# /git:publish-committed

Arguments: `$ARGUMENTS`

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4. A candidate repo is one on a branch other than its default, with commits ahead of `origin/<D>` that aren't pushed yet or have no open PR.
2. If HEAD is on `D` or detached, stop: "<repo> has no work branch to publish. Use `/git:publish` to commit onto a new one." Don't create a branch here.
3. If the branch's PR has already merged (procedure step 7), stop and suggest `/git:merged`.
4. If the branch has no commits ahead of `origin/<D>`, stop: "Nothing to publish on <branch>."
5. Push and open or update the PR (procedure step 8). Don't stage or commit.
6. Report (procedure step 9), counting the whole branch (`git -C "<R>" diff --raw origin/<D>...HEAD`), with the PR link and the number of uncommitted files left out.
