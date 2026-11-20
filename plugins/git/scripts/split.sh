#!/usr/bin/env bash
# Helper for /git:split-commits, /git:split-resume and /git:merged.
#
# A split moves some of the uncommitted edits on branch P to a new branch B
# made from origin/<D>. The edits that stay behind are "parked" in one commit
# at the tip of P. Git config records the link:
#   branch.<P>.splitPark  the park commit (unset when nothing was parked)
#   branch.<P>.splitTo    B
#   branch.<B>.splitFrom  P
# refs/drs-split/<B> keeps a backup commit of every edit as it was before the
# split, until the edits are restored.
#
# All working-tree changes go through git's own checkout (read-tree -u,
# reset), never through patches applied to files, so line-ending filters
# work as usual.
set -euo pipefail

die() { echo "split: $*" >&2; exit 1; }
cfg() { git -C "$R" config --get "$1" 2>/dev/null || true; }
current() { git -C "$R" symbolic-ref --short -q HEAD || true; }
workdir() {
  local gd; gd=$(git -C "$R" rev-parse --absolute-git-dir)
  mkdir -p "$gd/drs-split"; echo "$gd/drs-split"
}
dirty() { [ -n "$(git -C "$R" status --porcelain --ignore-submodules=dirty)" ]; }
counts() {
  # Counts the working tree's changes against HEAD, by kind.
  git -C "$R" status --porcelain --ignore-submodules=dirty | awk '
    { x=substr($0,1,2); p=substr($0,4)
      if (x=="??" || x ~ /A/) a++; else if (x ~ /D/) d++; else m++; n++ }
    END {
      s = ""
      if (a) s = s ", " a " added"; if (m) s = s ", " m " modified"; if (d) s = s ", " d " deleted"
      printf "%d file%s%s\n", n, (n == 1 ? "" : "s"), (s == "" ? "" : " (" substr(s, 3) ")")
    }'
}

# Restores the parked edits on the current branch as uncommitted changes.
unpark() {
  local P park; P=$(current); park=$(cfg "branch.$P.splitPark")
  if [ -n "$park" ]; then
    [ "$(git -C "$R" rev-parse HEAD)" = "$park" ] ||
      die "$P has commits on top of its park commit ${park:0:7}. Move them off, then run git reset HEAD~1 on the park commit."
    git -C "$R" reset -q HEAD~1
  fi
  git -C "$R" config --unset "branch.$P.splitPark" 2>/dev/null || true
  local B; B=$(cfg "branch.$P.splitTo")
  git -C "$R" config --unset "branch.$P.splitTo" 2>/dev/null || true
  [ -n "$B" ] && git -C "$R" update-ref -d "refs/drs-split/$B" 2>/dev/null || true
  [ -n "$park" ] && echo "restored: $(counts)" || echo "restored: nothing was parked"
}

cmd=${1:-}; [ $# -gt 0 ] && shift
case "$cmd" in

# prepare <R>: writes every uncommitted edit (staged, unstaged, untracked) as
# one patch against HEAD, without touching the real index. Prints its path
# and the --raw list.
prepare)
  R=$1; S=$(workdir)
  rm -f "$S"/*.idx "$S"/*.patch
  cp "$(git -C "$R" rev-parse --absolute-git-dir)/index" "$S/all.idx" 2>/dev/null ||
    GIT_INDEX_FILE="$S/all.idx" git -C "$R" read-tree HEAD
  GIT_INDEX_FILE="$S/all.idx" git -C "$R" add -A
  GIT_INDEX_FILE="$S/all.idx" git -C "$R" diff --cached --binary --no-color --no-ext-diff HEAD > "$S/all.patch"
  echo "$S/all.patch"
  GIT_INDEX_FILE="$S/all.idx" git -C "$R" diff --cached --raw HEAD
  ;;

# pick <R> <name> <spec>...: writes <name>.patch from parts of all.patch and
# prints its path. Each spec is a file path (as in all.patch, the new path for
# a rename), whole, or <path>:<n>[,<n>...] for only those hunks (numbered from
# 1 within that file).
pick)
  R=$1; NAME=$2; shift 2; S=$(workdir)
  [ -f "$S/all.patch" ] || die "run prepare first"
  [ $# -gt 0 ] || die "no files given"
  SPECS=$(printf '%s\n' "$@") awk '
    BEGIN {
      n = split(ENVIRON["SPECS"], a, "\n")
      for (i = 1; i <= n; i++) {
        if (a[i] == "") continue
        s = a[i]; f = s; h = ""
        c = match(s, /:[0-9,]+$/)
        if (c) { f = substr(s, 1, c - 1); h = substr(s, c + 1) }
        want[f] = 1
        if (h != "") { part[f] = 1; m = split(h, hh, ","); for (j = 1; j <= m; j++) hk[f SUBSEP hh[j]] = 1 }
      }
    }
    /^diff --git / {
      f = $0; k = 0
      while ((p = index(f, " b/")) > 0) { k += p + 2; f = substr(f, p + 3) }
      cur = f; hunk = 0; on = (cur in want); if (on) found[cur] = 1
      if (on) print; next
    }
    /^@@ / { hunk++ }
    {
      if (!on) next
      if (hunk == 0 || !(cur in part) || ((cur SUBSEP hunk) in hk)) print
    }
    END {
      for (f in want) if (!(f in found)) { print "split: no such file in the edits: " f > "/dev/stderr"; bad = 1 }
      exit bad
    }' "$S/all.patch" > "$S/$NAME.patch"
  [ -s "$S/$NAME.patch" ] || die "nothing picked"
  echo "$S/$NAME.patch"
  ;;

# check <R> <patch> <D>: exits 0 if the patch can be split off: it applies to
# origin/<D>, comes out of the full set of edits cleanly, and has no
# submodule pointers.
check)
  R=$1; PATCH=$2; D=$3; S=$(workdir)
  [ -s "$PATCH" ] || die "empty patch"
  if grep -qE '^(index [0-9a-f]+\.\.[0-9a-f]+ 160000|new file mode 160000|deleted file mode 160000|Subproject commit )' "$PATCH"; then
    die "submodule pointers can't be split off"
  fi
  [ -f "$S/all.idx" ] || die "run prepare first"
  rm -f "$S/check.idx" "$S/rev.idx"
  GIT_INDEX_FILE="$S/check.idx" git -C "$R" read-tree "origin/$D"
  GIT_INDEX_FILE="$S/check.idx" git -C "$R" apply --cached --check "$PATCH" 2>/dev/null ||
    die "doesn't apply to origin/$D (depends on unmerged work)"
  T_all=$(GIT_INDEX_FILE="$S/all.idx" git -C "$R" write-tree)
  GIT_INDEX_FILE="$S/rev.idx" git -C "$R" read-tree "$T_all"
  GIT_INDEX_FILE="$S/rev.idx" git -C "$R" apply --cached -R --check "$PATCH" 2>/dev/null ||
    die "doesn't come out of the current edits cleanly"
  echo ok
  ;;

# split <R> <patch> <D> <B>: parks the rest on the current branch P, creates
# B from origin/<D> and leaves the patch's edits on it, unstaged.
split)
  R=$1; PATCH=$2; D=$3; B=$4; S=$(workdir)
  P=$(current)
  [ -n "$P" ] || die "HEAD is detached"
  [ "$P" != "$D" ] || die "on $D; there is no work branch to split from"
  [ -z "$(cfg "branch.$P.splitPark")" ] || die "$P already has parked edits"
  [ -z "$(cfg "branch.$P.splitFrom")" ] || die "$P is itself a split branch; run /git:split-resume first"
  ! git -C "$R" show-ref --verify --quiet "refs/heads/$B" || die "branch $B already exists"
  base=$(git -C "$R" rev-parse HEAD)

  git -C "$R" add -A
  T_all=$(git -C "$R" write-tree)
  rm -f "$S/cand.idx" "$S/rest.idx"
  GIT_INDEX_FILE="$S/cand.idx" git -C "$R" read-tree "origin/$D"
  GIT_INDEX_FILE="$S/cand.idx" git -C "$R" apply --cached "$PATCH"
  T_cand=$(GIT_INDEX_FILE="$S/cand.idx" git -C "$R" write-tree)
  GIT_INDEX_FILE="$S/rest.idx" git -C "$R" read-tree "$T_all"
  GIT_INDEX_FILE="$S/rest.idx" git -C "$R" apply --cached -R "$PATCH"
  T_rest=$(GIT_INDEX_FILE="$S/rest.idx" git -C "$R" write-tree)

  backup=$(git -C "$R" commit-tree "$T_all" -p "$base" -m "split backup: every edit on $P before the split to $B")
  git -C "$R" update-ref "refs/drs-split/$B" "$backup"
  trap 'echo "split: failed part-way. Every edit is saved in refs/drs-split/'"$B"' ('"${backup:0:7}"'). To get them back: git switch -f '"$P"' && git reset -q --hard '"${base:0:7}"' && git read-tree -u --reset '"$backup"' && git reset -q" >&2' ERR

  # Make the working tree and index match the rest, then park it.
  git -C "$R" read-tree -u --reset "$T_rest"
  if [ "$T_rest" != "$(git -C "$R" rev-parse "HEAD^{tree}")" ]; then
    git -C "$R" commit -q --no-verify \
      -m "park: edits left on $P by /git:split-commits" \
      -m "Split to $B. /git:split-resume or /git:merged restores them; by hand, git reset HEAD~1."
    git -C "$R" config "branch.$P.splitPark" "$(git -C "$R" rev-parse HEAD)"
    parked=yes
  else
    git -C "$R" reset -q
    parked=no
  fi
  git -C "$R" config "branch.$P.splitTo" "$B"

  git -C "$R" switch -q --no-track -c "$B" "origin/$D"
  git -C "$R" config "branch.$B.splitFrom" "$P"
  git -C "$R" read-tree -u -m HEAD "$T_cand"
  git -C "$R" reset -q
  trap - ERR
  echo "split: $(counts)"
  echo "parked: $parked"
  ;;

# resume <R> [carry]: from a split branch, returns to its previous branch and
# restores the parked edits. With "carry", uncommitted changes on the split
# branch come along. On a parked branch itself, just restores.
resume)
  R=$1; MODE=${2:-}
  B=$(current); P=$(cfg "branch.$B.splitFrom")
  if [ -z "$P" ]; then
    [ -n "$(cfg "branch.$B.splitPark")" ] || die "$B isn't a split branch and has nothing parked"
    unpark; exit 0
  fi
  git -C "$R" show-ref --verify --quiet "refs/heads/$P" || die "$P no longer exists"
  carried=no
  if dirty; then
    [ "$MODE" = carry ] || die "$B has uncommitted changes"
    git -C "$R" stash push -q -u -m "split-resume: carried from $B"
    carried=yes
  fi
  git -C "$R" switch -q "$P"
  if [ $carried = yes ]; then
    # Pop onto the clean park commit first, so the parked edits can't block it.
    park=$(cfg "branch.$P.splitPark")
    if [ -n "$park" ] && [ "$(git -C "$R" rev-parse HEAD)" != "$park" ]; then
      die "$P has commits on top of its park commit. Your changes from $B are in the stash."
    fi
    git -C "$R" stash pop -q || die "carried changes conflict with $P's parked edits. Resolve the marked files; the stash is kept until you drop it."
    echo "carried: yes"
  fi
  unpark
  ;;

# return <R> <B> <D>: after B has merged, returns to its previous branch,
# restores the parked edits and merges origin/<D> into it.
return)
  R=$1; B=$2; D=$3
  P=$(cfg "branch.$B.splitFrom"); [ -n "$P" ] || die "$B isn't a split branch"
  git -C "$R" show-ref --verify --quiet "refs/heads/$P" || die "$P no longer exists"
  if [ "$(current)" = "$B" ]; then
    dirty && die "$B has uncommitted changes"
    git -C "$R" switch -q "$P"
  fi
  [ "$(current)" = "$P" ] || die "switch to $B or $P first"
  if [ -n "$(cfg "branch.$P.splitPark")" ]; then unpark; fi
  if git -C "$R" merge-base --is-ancestor "origin/$D" HEAD; then
    echo "merged: already up to date"
  else
    held=no
    if dirty; then git -C "$R" stash push -q -u -m "split: edits on $P while merging origin/$D"; held=yes; fi
    if ! git -C "$R" merge -q --no-edit "origin/$D"; then
      git -C "$R" merge --abort
      [ $held = yes ] && git -C "$R" stash pop -q
      die "merging origin/$D into $P conflicts. Your edits are back; merge it yourself."
    fi
    if [ $held = yes ] && ! git -C "$R" stash pop -q; then
      die "your edits conflict with origin/$D. Resolve the files marked; the stash is kept until you drop it."
    fi
    echo "merged: origin/$D"
  fi
  git -C "$R" config --unset "branch.$P.splitTo" 2>/dev/null || true
  git -C "$R" update-ref -d "refs/drs-split/$B" 2>/dev/null || true
  ;;

# state <dir>: one line per repo (the one at <dir> and its submodules) that
# has parked edits or is on a split branch. Never fails.
state)
  ROOT=$(git -C "${1:-.}" rev-parse --show-toplevel 2>/dev/null) || exit 0
  { echo "$ROOT"
    git -C "$ROOT" submodule status --recursive 2>/dev/null | awk '$1 !~ /^-/ {print $2}' | sed "s|^|$ROOT/|"
  } | while read -r R; do
    name=$(basename "$R"); b=$(current)
    [ -n "$b" ] || continue
    park=$(cfg "branch.$b.splitPark"); from=$(cfg "branch.$b.splitFrom")
    if [ -n "$park" ]; then
      if [ "$(git -C "$R" rev-parse HEAD)" = "$park" ]; then
        echo "$name: $b has parked edits from a split to $(cfg "branch.$b.splitTo"). /git:split-resume $name restores them."
      else
        echo "$name: $b has commits on top of its park commit ${park:0:7}, so its parked edits can't be restored automatically."
      fi
    elif [ -n "$from" ]; then
      echo "$name: on split branch $b, split from $from. /git:split-resume $name returns to it; after the PR merges, /git:merged $name."
    fi
  done
  exit 0
  ;;

*) die "usage: split.sh prepare|check|split|resume|return|state ..." ;;
esac
