---
name: prune
description: Find every local branch in the target repo whose pull request has merged (squash merges included) and delete the ones you confirm.
argument-hint: "[repo]"
disable-model-invocation: true
allowed-tools:
  - Read
  - AskUserQuestion
  - Bash(git *)
  - Bash(gh pr list *)
  - Bash(gh repo view *)
---

# /git:prune

Arguments: `$ARGUMENTS`

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/procedure.md` and follow its steps 1 to 4. A candidate repo is any repo with local branches other than its default branch. If several qualify, ask as usual.
2. List the local branches: `git -C "<R>" for-each-ref --format="%(refname:short) %(upstream:track)" refs/heads`. Leave out `D` and the current branch.
3. Sort each branch into one of three groups:
   - **Merged:** passes the check in procedure step 7.
   - **Remote gone, no merged PR:** the upstream shows `[gone]`, but the branch fails the check.
   - **Not merged:** everything else.
4. If there are no merged branches and none with the remote gone, say so and stop.
5. Ask with AskUserQuestion, `multiSelect: true`. List each merged branch as an option labelled "<branch> (PR #n)". List each remote-gone branch as "<branch> (remote gone, no merged PR)", with a description warning that its work may not be on `D`. AskUserQuestion allows at most 4 options per question; with more branches, ask in several questions of up to 4 each, in one call (up to 4 questions). If there are still more, run a further round.
6. Delete the ticked branches with `git -C "<R>" branch -D <branch>`, then `git -C "<R>" remote prune origin`.
7. Report in one line, with no other commentary: `<repo> · deleted <n>: <names> · kept <m> unmerged`.
