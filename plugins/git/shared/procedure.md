# Shared procedure for the /git: commands

Every command follows these steps. `R` is the target repo's top-level path, `D` its default branch, and `O/N` its GitHub `owner/name`.

Run git with `git -C "<R>" …` and gh with `--repo O/N`, never with `cd`. Use the Bash tool.

Running a command is the user's explicit request to stage, commit, push or delete as that command describes, even where their instructions otherwise say to leave changes uncommitted. Do it without remarking on that. It authorises nothing beyond the command.

## 1. Parse the arguments

`$ARGUMENTS` is `[repo] [extra] [-- hint]`:

- **repo** (optional): a path, relative to the session's working directory or absolute, or a submodule's name or path, e.g. `DrsFramework` or `Plugins/DrsFramework`. A token that matches no repo is not a repo (some commands take another argument; see the command).
- **hint** (optional): everything after `--`. Use it to guide commit and PR wording or splitting. It never overrides the safety rules.

## 2. Choose the target repo

1. If a repo was given, resolve it: `git -C "<path>" rev-parse --show-toplevel`. For a name, match it against the submodule paths listed in step 2.2 (last path segment or full path). No match → stop and say which repos you looked in.
2. Otherwise find the candidates:
   - The session repo: `git rev-parse --show-toplevel` in the working directory. If it fails, stop: "This session isn't in a git repo. Name the repo, e.g. `/git:<command> <path>`."
   - Its submodules: `git -C "<root>" submodule status --recursive`. The second field of each line is the path relative to `<root>`. Skip lines starting with `-` (not checked out).
3. Keep the candidates this command can act on (each command says what counts). To check for changes, use `git -C "<repo>" status --porcelain --ignore-submodules=dirty`. That way a host doesn't count as changed just because a submodule has edits inside it. A host whose only changes are submodule pointers is **pointer only**.
4. None → stop and list the repos checked, with why each didn't qualify.
5. One → use it, and say which.
6. Several → if the rules loaded for the session repo (step 3) say how to choose, follow them. Otherwise ask with AskUserQuestion: one option per candidate, labelled `<name> · <branch or "detached"> · <n> changed` (add `· pointer only` where it applies). Pick exactly one repo; never act on several in one run.

## 3. Load the rules

1. Read `${CLAUDE_PLUGIN_ROOT}/shared/defaults.md`.
2. Read `<R>/CLAUDE.md`, if it exists. If it links a git workflow document (link text or file name mentions git workflow, e.g. `Docs/GitWorkflow.md`), read that file, resolving the link relative to `CLAUDE.md`.
3. The repo's rules override the defaults where they differ and add to them otherwise. Your global CLAUDE.md preferences apply on top, and the user's hint applies on top of everything.
4. If no workflow document was found, say "No workflow rules found in <R>; using the plugin defaults." once in the report.
5. Note any project-level rules that change these steps: how to choose a target, checks to run before committing or publishing, extra PR sections, a different base branch, a different staging rule.

## 4. Find the default branch and remote

- `D`: `git -C "<R>" symbolic-ref --short refs/remotes/origin/HEAD`, minus the `origin/` prefix. If that fails: `gh repo view --repo O/N --json defaultBranchRef --jq .defaultBranchRef.name`. If both fail, assume `main` and say so.
- `O/N`: parse `git -C "<R>" remote get-url origin` (both `https://github.com/O/N(.git)` and `git@github.com:O/N(.git)`).
- `git -C "<R>" fetch origin` before any branch decision.

## 5. Make sure there is a work branch

Only `commit`, `commit-staged` and `publish` create branches. Check the current state with `git -C "<R>" symbolic-ref --short -q HEAD` (empty means a detached HEAD).

| State | Action |
|---|---|
| On `D`, or detached | Create a branch (below). |
| On another branch whose PR has merged (check 7) | Stop: "<branch>'s PR has already merged. Run `/git:merged` first, then try again." |
| On another branch | Reuse it. If the changes look unrelated to the branch name and its commits (`git -C "<R>" log --oneline origin/<D>..HEAD`), ask with AskUserQuestion: "Commit on <branch>" / "Start a new branch". |

**Creating a branch:**

1. Choose the name from the rules: `<type>/<short-kebab-description>`, with the type taken from the change.
2. If HEAD is detached and has commits that aren't on `origin/<D>` (`git -C "<R>" merge-base --is-ancestor HEAD origin/<D>` fails, and `git -C "<R>" log --oneline origin/<D>..HEAD` isn't empty), stop. Report those commits, since they'd be left behind.
3. `git -C "<R>" switch --no-track -c <name> origin/<D>`. `--no-track` stops the branch tracking `origin/<D>`; its upstream is set on its first push.
4. If the switch fails because local changes conflict with `origin/<D>`, stop and report git's message. Never stash or discard to get round it.
5. If HEAD was behind `origin/<D>`, say that the changes now sit on the latest `origin/<D>`.

## 6. Commit

1. Run any checks the repo's rules list for before committing. If one fails, stop and show its output.
2. Read what's being committed: `git -C "<R>" diff --cached --stat` and `git -C "<R>" diff --cached`.
3. Write the message by the rules: subject, an optional body, then the attribution lines from this session's instructions.
4. Commit with a heredoc, so the message is passed exactly:
   ```
   git -C "<R>" commit -F - <<'EOF'
   <message>
   EOF
   ```
5. If a hook fails, report it and stop. Don't retry with `--no-verify`.

## 7. Has a branch's PR merged?

To decide whether a branch `B` is merged:

```
gh pr list --repo O/N --state merged --head B --json number,url,headRefOid,mergedAt
git -C "<R>" rev-parse B
```

`B` is merged only if one of those PRs has `headRefOid` equal to `B`'s tip. A merged PR whose head differs means commits were added after the merge, so `B` is **not** merged. Also treat `B` as merged if `git -C "<R>" merge-base --is-ancestor B origin/<D>` succeeds (an ordinary merge, or a branch with no commits of its own).

## 8. Push and open or update the PR

1. Run any checks the repo's rules list for before publishing. If one fails, stop and show its output.
2. Refuse to push `D`.
3. `git -C "<R>" push -u origin <branch>`. On the first push this sets the upstream to `origin/<branch>`. Never `--force`.
4. Look for an open PR: `gh pr list --repo O/N --state open --head <branch> --json number,url`.
5. Write the title and description by the rules (Pull requests). The base is `origin/<D>` unless the rules say otherwise.
   - Base them on every commit on the branch (`git -C "<R>" log origin/<D>..HEAD` and `git -C "<R>" diff origin/<D>...HEAD`), not just the latest.
   - **Testing:** use what was built and run in this session. If the session has no record, ask one short question with AskUserQuestion rather than guessing.
6. No open PR: `gh pr create --repo O/N --base <D> --head <branch> --title "<title>" --body-file - <<'EOF' … EOF`.
   Open PR: `gh pr edit <number> --repo O/N --title "<title>" --body-file - <<'EOF' … EOF`.

## 9. Report

End with one short summary: repo, branch, what was staged or committed (the subject), and the PR link where there is one. Mention anything that was left out, such as unstaged files.
