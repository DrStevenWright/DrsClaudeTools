#!/usr/bin/env bash
# SessionStart: tells Claude about parked split edits in the session's repos.
out=$(bash "$(dirname "$0")/../scripts/split.sh" state "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null)
[ -n "$out" ] || exit 0
printf 'git plugin: split state in this session'"'"'s repos. Mention it to the user in one line at the start of your first reply:\n%s\n' "$out"
exit 0
