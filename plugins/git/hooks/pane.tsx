// The git pane: one line per repo (the session's repo and its submodules) with
// buttons that run the /git: commands, plus the same commands on the desktop
// app's right-click menu. Every button runs a /git: command as if typed, so the
// command's own rules and judgement apply; git itself only feeds the display.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitRepo } from '../types'

const PANE = 'git'
const TITLE = 'Git tools'
const REFRESH_MS = 15000

const repos = atom({ plugin: 'git', key: 'repos' } as const, [] as GitRepo[], {
  shape: 'repos-1',
})
const busy = atom({ plugin: 'git', key: 'busy' } as const, '')
const problem = atom({ plugin: 'git', key: 'problem' } as const, '')

type $ = EngineInterface

async function git($: $, args: string[], cwd?: string) {
  try {
    const argv = cwd === undefined ? ['git', ...args] : ['git', '-C', cwd, ...args]
    const run = await $.process.run(argv, { timeoutMs: 15000 })
    return { isOk: run.exitCode === 0, out: run.stdout.trim() }
  } catch {
    return { isOk: false, out: '' }
  }
}

const lastSegment = (path: string) => path.split('/').filter(Boolean).pop() ?? path

// A submodule's default is the branch the host's .gitmodules tracks, if any.
async function defaultBranchOf($: $, path: string, tracked?: string) {
  if (tracked !== undefined && tracked !== '') {
    return tracked
  }
  const head = await git($, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], path)

  return head.isOk ? head.out.replace(/^origin\//, '') : 'main'
}

// A changed submodule pointer whose commit isn't on the submodule's default branch.
async function pointerWarning($: $, root: string, sub: string) {
  const path = `${root}/${sub}`
  const subDefault = await defaultBranchOf($, path, await trackedBranch($, root, sub))
  const onDefault = await git($, ['merge-base', '--is-ancestor', 'HEAD', `origin/${subDefault}`], path)
  if (onDefault.isOk) {
    return undefined
  }
  const branch = await git($, ['symbolic-ref', '--short', '-q', 'HEAD'], path)
  const sha = await git($, ['rev-parse', '--short', 'HEAD'], path)
  const where = branch.isOk && branch.out !== '' ? branch.out : 'detached'

  return `${sub} pointer → ${where} @ ${sha.out}`
}

async function trackedBranch($: $, root: string, sub: string) {
  const branch = await git($, ['config', '-f', '.gitmodules', '--get', `submodule.${sub}.branch`], root)

  return branch.isOk ? branch.out : undefined
}

async function readRepo($: $, path: string, arg: string, name: string, tracked?: string): Promise<GitRepo> {
  const [head, defaultBranch, status] = await Promise.all([
    git($, ['symbolic-ref', '--short', '-q', 'HEAD'], path),
    defaultBranchOf($, path, tracked),
    git($, ['status', '--porcelain=v2', '--ignore-submodules=dirty'], path),
  ])
  const branch = head.isOk && head.out !== '' ? head.out : null
  const lines = status.out.split('\n').filter(line => line !== '' && !line.startsWith('#'))
  // Porcelain v2: `1 XY <sub> …` where <sub> starts with S for a submodule.
  const pointers = lines
    .map(line => line.split(' '))
    .filter(fields => fields[0] === '1' && (fields[2] ?? '').startsWith('S'))
    .map(fields => fields.slice(8).join(' '))

  const [ahead, park, from] = await Promise.all([
    branch === null
      ? Promise.resolve({ isOk: false, out: '0' })
      : git($, ['rev-list', '--count', `origin/${defaultBranch}..HEAD`], path),
    branch === null
      ? Promise.resolve({ isOk: false, out: '' })
      : git($, ['config', '--get', `branch.${branch}.splitPark`], path),
    branch === null
      ? Promise.resolve({ isOk: false, out: '' })
      : git($, ['config', '--get', `branch.${branch}.splitFrom`], path),
  ])

  const warnings: string[] = []
  for (const sub of pointers) {
    const warning = await pointerWarning($, path, sub)
    if (warning !== undefined) {
      warnings.push(warning)
    }
  }

  return {
    path,
    arg,
    name,
    branch,
    defaultBranch,
    changed: lines.length,
    isPointerOnly: lines.length > 0 && pointers.length === lines.length,
    ahead: ahead.isOk ? Number(ahead.out) || 0 : 0,
    isParked: park.isOk && park.out !== '',
    splitFrom: from.isOk && from.out !== '' ? from.out : null,
    warnings,
  }
}

let isRefreshing = false
let isRefreshWanted = false

async function refresh($: $): Promise<void> {
  if (isRefreshing) {
    isRefreshWanted = true
    return
  }
  isRefreshing = true
  try {
    const top = await git($, ['rev-parse', '--show-toplevel'])
    if (!top.isOk) {
      await update($, repos, () => [])
      await update($, problem, () => "This session isn't in a git repo.")
      return
    }
    const root = top.out
    // Relative repo arguments only work when the session runs at the root.
    const atRoot = (await git($, ['rev-parse', '--show-prefix'])).out === ''
    const subs = (await git($, ['submodule', 'status', '--recursive'], root)).out
      .split('\n')
      .filter(line => line !== '' && !line.startsWith('-'))
      .map(line => line.slice(1).split(' ')[1] ?? '')
      .filter(sub => sub !== '')

    const list = await Promise.all([
      readRepo($, root, atRoot ? '.' : root, lastSegment(root)),
      ...subs.map(async sub =>
        readRepo(
          $,
          `${root}/${sub}`,
          atRoot ? sub : `${root}/${sub}`,
          lastSegment(sub),
          await trackedBranch($, root, sub),
        ),
      ),
    ])
    await update($, repos, () => list)
    await update($, problem, () => '')
  } finally {
    isRefreshing = false
    if (isRefreshWanted) {
      isRefreshWanted = false
      void refresh($)
    }
  }
}

async function runCommand($: $, command: string, arg: string) {
  const typed = `/${command}${arg === '' ? '' : ` ${arg}`}`
  await update($, busy, () => typed)
  try {
    await $.command.run({ command, args: arg })
  } catch (err) {
    await update($, busy, () => '')
    $.ui.toast(`${typed} didn't run: ${String(err)}`)
  }
}

async function openPane($: $) {
  await $.ui.open({ id: PANE, title: TITLE })
  await refresh($)
}

async function isPaneShown($: $) {
  return (await $.ui.panes()).some(pane => pane.id === PANE && pane.isShown)
}

function summary(repo: GitRepo) {
  const parts: string[] = []
  if (repo.changed > 0) {
    parts.push(`${repo.changed} changed${repo.isPointerOnly ? ' (pointer only)' : ''}`)
  }
  if (repo.ahead > 0) {
    parts.push(`${repo.ahead} to publish`)
  }

  return parts.length === 0 ? 'clean' : parts.join(' · ')
}

// Why a command doesn't apply to the repo now; undefined when it does.
function unavailable(repo: GitRepo, command: string): string | undefined {
  const isResume = command === 'git:split-resume'
  if (repo.isParked) {
    return isResume ? undefined : 'edits are parked here, so resume the split first'
  }
  const onWorkBranch = repo.branch !== null && repo.branch !== repo.defaultBranch
  const hasChanges = repo.changed > 0
  switch (command) {
    case 'git:stage':
      return hasChanges ? undefined : 'nothing to stage'
    case 'git:commit':
      return hasChanges ? undefined : 'nothing to commit'
    case 'git:publish':
      return hasChanges || (onWorkBranch && repo.ahead > 0) ? undefined : 'nothing to publish'
    case 'git:split-commits':
      if (!hasChanges) {
        return 'no edits to split'
      }
      if (!onWorkBranch) {
        return 'needs a work branch, not ' + (repo.branch ?? 'a detached HEAD')
      }
      return repo.splitFrom === null ? undefined : 'this is already a split branch'
    case 'git:merged':
      return onWorkBranch ? undefined : 'not on a work branch'
    default:
      return repo.splitFrom !== null ? undefined : 'no split to resume'
  }
}

const EXTRAS: readonly (readonly [string, string])[] = [
  ['git:commit-staged', 'Commit staged'],
  ['git:publish-committed', 'Publish committed'],
  ['git:prune', 'Prune merged branches'],
]

// The dim line after each right-click menu row.
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  'git:stage': 'Stages every change',
  'git:commit': 'Stages everything and commits',
  'git:publish': 'Commits, pushes and opens or updates the PR',
  'git:merged': 'After the PR merges, tidies up the branch',
  'git:split-commits': 'Splits one change off onto its own branch',
  'git:split-resume': 'Goes back and restores the parked edits',
  'git:commit-staged': "Commits only what's already staged",
  'git:publish-committed': 'Pushes existing commits and opens or updates the PR, ignoring uncommitted changes',
  'git:prune': 'Deletes local branches whose PRs have merged',
}

const MAIN: readonly (readonly [string, string])[] = [
  ['git:stage', 'Stage'],
  ['git:commit', 'Commit'],
  ['git:publish', 'Publish'],
  ['git:merged', 'Merged'],
  ['git:split-commits', 'Split'],
  ['git:split-resume', 'Resume split'],
]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'git-pane',
      description: 'Show the Git tools pane: Git commands for each repo',
    })
    $.clock.every(REFRESH_MS, () => {
      void (async () => {
        if (await isPaneShown($)) {
          await refresh($)
        }
      })()
    })
    void refresh($)

    return started
  })

  on('command.run', { command: 'git-pane' }, async $ => {
    await openPane($)

    return { text: 'Git tools pane opened.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await update($, busy, () => '')
    void refresh($)

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, repos)
    const running = await read($, busy)
    const issue = await read($, problem)

    const buttons = (repo: GitRepo) =>
      MAIN.map(([command, label]) => {
        const why = unavailable(repo, command)

        return (
          <Button
            key={`${repo.path}:${command}`}
            dimColor={why !== undefined}
            variant={why === undefined && repo.isParked ? 'primary' : undefined}
            onPress={() =>
              why === undefined ? runCommand($, command, repo.arg) : $.ui.toast(`${label}: ${why}`)
            }
          >
            {label}
          </Button>
        )
      })

    return (
      <Box flexDirection="column" gap={1}>
        {issue !== '' && <Text color="error">{issue}</Text>}
        {list.map(repo => (
          <Box key={repo.path} flexDirection="column">
            <Text>
              <Text bold>{repo.name}</Text> · {repo.branch ?? 'detached'} · {summary(repo)}
              {repo.splitFrom !== null && <Text dimColor> · split from {repo.splitFrom}</Text>}
            </Text>
            {repo.isParked && <Text color="warning">edits parked by a split</Text>}
            {repo.warnings.map(warning => (
              <Text color="warning">{warning}</Text>
            ))}
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {buttons(repo)}
            </Box>
          </Box>
        ))}
        {running !== '' && <Text dimColor>Running {running}</Text>}
      </Box>
    )
  })

  // Right-click menu: the full set when the pane isn't on screen, the extras when it is.
  on('ui.render', { component: 'ContextMenu' }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const isShown = await isPaneShown($)
    const items = isShown ? EXTRAS : [...MAIN, ...EXTRAS]

    return (
      <Box flexDirection="column">
        <Button key="git:pane" label="Show Git tools pane" onPress={() => openPane($)}>
          Show Git tools pane <Text dimColor>· Git commands for each repo</Text>
        </Button>
        {items.map(([command, label]) => (
          <Button key={command} label={`Git: ${label}`} onPress={() => runCommand($, command, '')}>
            Git: {label} <Text dimColor>· {DESCRIPTIONS[command]}</Text>
          </Button>
        ))}
      </Box>
    )
  })
}
