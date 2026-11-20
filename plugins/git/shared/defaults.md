# Default git conventions

These apply to every repo. A repo's own workflow rules (found as described in `procedure.md`) override any of them where they differ, and add to them otherwise.

## Commit types

All names follow [Conventional Commits](https://www.conventionalcommits.org/).

| Type | Use for |
|---|---|
| `feat` | New behaviour or API for users |
| `fix` | A bug fix |
| `refactor` | A code change that adds no feature and fixes no bug |
| `docs` | Documentation only |
| `test` | Adding or changing tests only |
| `chore` | Upkeep with no change for users: tooling, config, dependency and submodule updates |
| `ci` | CI configuration |
| `perf` | A change made for performance |
| `build` | Build system changes |

Pick the type from what the change means for users, not from which files it touches. A scope is optional; use one only when the repo's rules define scopes and the change sits in one of them.

## Commits

- Subject: `<type>(<scope>): <imperative summary>`, or `<type>: <imperative summary>` without a scope. Lower case after the colon, no full stop, about 72 characters at most.
- Add a body only when the reason for the change isn't obvious from the subject.
- One commit per command run, unless the user's hint asks for more.
- End the message with the commit attribution lines this session's instructions give, if any. Never invent or hard-code them.

## Branches

- Name branches `<type>/<short-kebab-description>`, using the commit types. No Git Flow prefixes (`feature/`, `bugfix/`, `hotfix/`).
- Never commit to the default branch. Start a new branch from the remote default branch for each piece of work, and don't reuse a branch after its PR has merged.
- A new branch tracks its own remote branch (set on its first push), never the default branch.

## Pull requests

- Title: the same format as a commit subject. With squash merges it becomes the commit subject on the default branch.
- Description, written for someone reading the history later:
  - what changed and why;
  - **Testing:** what was built and run, and what wasn't tested.
- End the description with the PR attribution line this session's instructions give, if any.
- Open PRs against the default branch, ready for review (not draft).

## Safety

- Push and open PRs only when the command asks for it.
- Never force-push, never push to the default branch, and never rewrite published history.
- Pull with `--ff-only`. If that fails, stop and report; don't merge or rebase on your own.
- Never stash, reset or discard the user's changes to make a command work. The split commands park and restore edits only through `scripts/split.sh`, which keeps a backup until they are restored.
- Delete only local branches. The remote deletes merged head branches itself.

## Staging

- Staging everything means `git add -A`: modified, deleted and untracked files, and changed submodule pointers.
- **On a split branch** (`git -C "<R>" config --get branch.<branch>.splitFrom` prints a branch), never stage submodule pointers: after `git add -A`, unstage each with `git -C "<R>" reset -q -- <path>`. A submodule's checkout belongs to the branch the split came from.
