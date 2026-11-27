import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type {
  ParkCandidate,
  ParkDraft,
  ParkedFrom,
  ParkedPoint,
  ParkedView,
} from '../types'

const PANE = 'parked-items'
const TITLE = 'Parked items'
// The list kept across sessions and projects.
const STORE_KEY = 'points-v1'

let cachedVersion: string | undefined
/** The mod's version, from its manifest, as "v1.0.0". */
async function version($: $) {
  if (cachedVersion === undefined) {
    try {
      const manifest = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)) as {
        version?: unknown
      }
      cachedVersion = typeof manifest.version === 'string' ? `v${manifest.version}` : ''
    } catch {
      cachedVersion = ''
    }
  }
  return cachedVersion
}

/** A project folder's name as words: "my-tool" and "MyTool" both read "My Tool". */
function projectName(folder: string) {
  return folder
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}
// The tool Claude calls to offer to park something.
const PARK_TOOL = 'park'

const OFFER_SECTION = {
  id: 'parked-items:offer',
  scope: 'session',
  text: [
    '# Parking follow-ups',
    'The user keeps a list of parked follow-ups: work they want to come back to later.',
    'When the conversation decides to put a specific piece of follow-up work off (because it is blocked, because the',
    'user is busy with something else, or because they want to think about it more), call',
    `mcp__parked-items__${PARK_TOOL} with a proposed title and notes. That only opens a dialog: the user edits and`,
    'confirms it, so you need not ask first.',
    'Offer once per follow-up. Do not offer for work you are about to do now, for vague ideas, or when the user has',
    'said they do not want it parked.',
  ].join('\n'),
} as const

// Change a tag when that value's fields change: an earlier version's value is
// then read as the initial one.
const points = atom(
  { plugin: 'parked-items', key: 'points' } as const,
  [] as ParkedPoint[],
  { shape: 'points-1' },
)
const isPaneOpen = atom({ plugin: 'parked-items', key: 'isPaneOpen' } as const, false)

/** Opens the pane, and notes it's open so the reminder line steps aside. */
async function openPane($: $) {
  await $.ui.open({ id: PANE, title: TITLE })
  await update($, isPaneOpen, () => true)
}

const view = atom(
  { plugin: 'parked-items', key: 'view' } as const,
  { tab: 'open' } as ParkedView,
  { shape: 'view-4' },
)

type $ = EngineInterface

// ---------- the stored list ----------

function isPoint(x: unknown): x is ParkedPoint {
  const p = x as ParkedPoint
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.id === 'string' &&
    typeof p.title === 'string' &&
    (p.status === 'open' || p.status === 'closed')
  )
}

async function loadStored($: $): Promise<ParkedPoint[]> {
  const raw = await $.store.get(STORE_KEY)
  return Array.isArray(raw) ? raw.filter(isPoint) : []
}

/** Re-reads the store, so changes made in other sessions show here. */
async function refresh($: $) {
  const stored = await loadStored($)
  await update($, points, () => stored)
}

/** Applies a change to the stored list, read fresh so other sessions' changes are kept. */
async function mutate($: $, fn: (list: ParkedPoint[]) => ParkedPoint[]) {
  const next = fn(await loadStored($))
  await $.store.set(STORE_KEY, next)
  await update($, points, () => next)
}

// ---------- helpers ----------

async function newId($: $) {
  const now = await $.clock.now()
  return now.toString(36) + Math.random().toString(36).slice(2, 7)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(ms: number) {
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function folderName(path: string) {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? path
}

function oneLine(text: string, max: number) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** The first `count` words of the text's first line, with "…" when there was more. */
function firstWords(text: string, count: number) {
  const words = (text.trim().split('\n')[0] ?? '').trim().split(/\s+/).filter(Boolean)
  const head = words.slice(0, count).join(' ')
  return oneLine(words.length > count ? `${head}…` : head, 80)
}

async function currentChat($: $): Promise<ParkedFrom> {
  const [sessionId, projectPath, messages] = await Promise.all([
    $.session.id(),
    $.session.root(),
    $.session.messages(),
  ])
  const first =
    'deny' in messages
      ? undefined
      : messages.map(m => (m.role === 'user' ? plainText(m.text) : '')).find(text => text !== '')
  return {
    sessionId,
    projectPath,
    project: folderName(projectPath),
    chat: first ? firstWords(first, 10) : '',
  }
}

// What Claude Code wraps around a slash command or a note it adds to a message, not what anyone wrote.
const WRAPPERS =
  /<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|system-reminder)>[\s\S]*?<\/\1>/g

/** A message's text without the command and system wrappers Claude Code adds. */
function plainText(text: string) {
  return text.replace(WRAPPERS, '').trim()
}

// ---------- asking Claude what to park ----------

function suggestPrompt(title: string, notes: string) {
  return [
    'The user wants to park a follow-up from this conversation: a piece of work to come back to later.',
    title ? `Their working title for it: "${title}".` : '',
    notes
      ? 'Their notes for it, which may be text they selected from the conversation:\n' +
        `<<<\n${notes.slice(0, 4000)}\n>>>`
      : '',
    title || notes
      ? 'Base your suggestions on that.'
      : 'They gave no description, so work out what they most likely mean from the recent conversation.',
    'If it is clear, give one candidate. If it is ambiguous, give two or three different candidates, the most likely first.',
    'Reply with only a JSON array and nothing else, in this form:',
    '[{"title": "...", "notes": "..."}]',
    'title: one line, under 80 characters, saying what the follow-up is.',
    'notes: one or two sentences with the context needed to pick it up later.',
    'Do not use any tools.',
  ]
    .filter(Boolean)
    .join('\n')
}

function parseCandidates(text: string): ParkCandidate[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (c): c is ParkCandidate =>
          typeof c === 'object' && c !== null && typeof c.title === 'string' && c.title.trim() !== '',
      )
      .slice(0, 3)
      .map(c => ({
        title: oneLine(c.title, 120),
        notes: typeof c.notes === 'string' ? c.notes.trim() : '',
      }))
  } catch {
    return []
  }
}

/** The text of the message a right-click was on, or undefined where it can't be found. */
async function messageText($: $, id: string) {
  const recent = await $.session.messages({ last: 400 })
  if ('deny' in recent) return undefined
  const found = recent.find(m => m.uuid === id)
  const text = found ? plainText(found.text) : ''
  return text !== '' ? text : undefined
}

/** The last few messages as plain text, for a quick request that doesn't carry the whole chat. */
async function recentText($: $) {
  const recent = await $.session.messages({ last: 8 })
  if ('deny' in recent) return ''
  return recent
    .map(m => ({ role: m.role, text: plainText(m.text) }))
    .filter(m => m.text !== '')
    .map(m => `${m.role === 'user' ? 'User' : 'Claude'}: ${m.text.slice(0, 1500)}`)
    .join('\n\n')
}

/**
 * Asks Claude what to park. With a title or notes to go on, a quick request
 * with those and the last few messages; otherwise, or if that fails, a request
 * that reads the whole chat.
 */
async function askClaude($: $, title: string, notes: string) {
  if (title || notes) {
    const context = await recentText($)
    const quick = await $.model.complete({
      model: 'haiku',
      prompt:
        (context ? `The most recent messages of the conversation:\n<<<\n${context}\n>>>\n\n` : '') +
        suggestPrompt(title, notes),
      maxTokens: 600,
      timeoutMs: 20000,
    })
    if (quick.isAnswered && parseCandidates(quick.text).length > 0) return quick
  }
  return $.model.fork({ prompt: suggestPrompt(title, notes) })
}

/** Opens the park dialog, with the title and notes filled in where given. */
async function startPark($: $, title: string, notes: string, notesPlaceholder?: string) {
  const from = await currentChat($)
  const draft: ParkDraft = {
    token: await newId($),
    status: 'idle',
    candidates: [],
    title,
    notes,
    notesPlaceholder,
    from,
    fromLabel: from.chat,
  }
  await update($, view, v => ({ ...v, tab: 'open' as const, draft, editing: undefined, confirmDelete: undefined }))
  await openPane($)
}

/** The Suggest button: asks Claude for titles, leaving what the person typed alone. */
async function suggest($: $) {
  const d = (await read($, view)).draft
  if (!d || d.status === 'loading') return
  const token = await newId($)
  await setDraft($, x => ({ ...x, token, status: 'loading', failure: undefined }))

  const reply = await askClaude($, d.title.trim(), d.notes.trim())
  const candidates = reply.isAnswered ? parseCandidates(reply.text) : []
  const failure = !reply.isAnswered
    ? 'Claude could not suggest anything.'
    : candidates.length === 0
      ? 'Claude did not suggest anything.'
      : undefined

  // A newer Suggest, a Cancel or a new park replaced this one.
  await setDraft($, x =>
    x.token !== token
      ? x
      : { ...x, status: failure ? ('failed' as const) : ('ready' as const), failure, candidates },
  )
}

/** Uses a suggestion: its title, and its notes unless the person already has some. */
function useSuggestion($: $, i: number) {
  return setDraft($, d => {
    const c = d.candidates[i]
    if (!c) return d
    // Notes that are empty, or still as an earlier suggestion filled them, take this one's.
    const isNotesFromSuggestion = d.notes.trim() === '' || d.notes === d.suggestedNotes
    return isNotesFromSuggestion
      ? { ...d, title: c.title, notes: c.notes, suggestedNotes: c.notes }
      : { ...d, title: c.title }
  })
}

async function confirmPark($: $) {
  const d = (await read($, view)).draft
  if (!d) return
  const title = d.title.trim()
  if (title === '') {
    $.ui.toast('Give the item a title first.')
    return
  }
  const point: ParkedPoint = {
    id: await newId($),
    title,
    notes: d.notes.trim(),
    status: 'open',
    parkedAt: await $.clock.now(),
    from: { ...d.from, chat: oneLine(d.fromLabel, 200) },
  }
  await mutate($, list => [point, ...list])
  await update($, view, v => ({ ...v, draft: undefined }))
  $.ui.toast(`Parked: ${oneLine(title, 60)}`)
}

/** "2 parked issues (3 total)": this project's open points, then all of them. */
function statusText(here: number, total: number) {
  return `${here} parked ${here === 1 ? 'issue' : 'issues'} (${total} total)`
}

function setDraft($: $, fn: (d: ParkDraft) => ParkDraft) {
  return update($, view, v => (v.draft ? { ...v, draft: fn(v.draft) } : v))
}

/** Gives Claude the park tool, for its offers. */
function registerParkTool($: $) {
  return $.tool.register({
    name: PARK_TOOL,
    description:
      'Offers to park a follow-up: opens the Parked items dialog with a proposed title and notes, for the user to ' +
      'edit and confirm. Nothing is saved unless the user presses Park. Use it when the conversation decides to put ' +
      'a piece of work off for later.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'One line, under 80 characters, saying what the follow-up is.' },
        notes: {
          type: 'string',
          description: 'One to three sentences with the context needed to pick it up later.',
        },
      },
      required: ['title'],
    },
    isDeferred: false,
  })
}

// ---------- the hooks ----------

export const register: Register = (on, options) => {
  // The "Claude offers to park" setting, off unless the person turns it on.
  const isOffering = options.offerToPark === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'park',
      description: 'Park a follow-up from this chat to come back to later',
      argumentHint: '[what to park]',
    })
    await $.command.register({
      name: 'parked',
      description: 'Show your parked items',
    })
    if (isOffering) {
      await registerParkTool($)
    }
    await refresh($)
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    await update($, isPaneOpen, () => isOpen)
    return next(e)
  })

  // Claude's offer to park: opens the dialog filled in, for the person to confirm.
  on('tool.call', { tool: 'mcp__parked-items__park' }, async ($, e) => {
    // The setting was turned off after the tool was registered in this session.
    if (!isOffering) return { deny: 'Offers to park are turned off in the Parked Items settings.' }
    // A plugin tool's arguments arrive as fields of the call.
    const input = e as unknown as { title?: unknown; notes?: unknown }
    const title = typeof input.title === 'string' ? oneLine(input.title, 120) : ''
    const notes = typeof input.notes === 'string' ? input.notes.trim() : ''
    if ((await read($, view)).draft) {
      return {
        result:
          'The park dialog is already open with something else in it, so nothing was offered. ' +
          'Mention the follow-up in your reply instead.',
      }
    }
    await startPark($, title, notes)
    return {
      result:
        'Opened the park dialog in the Parked items pane with your title and notes. The user decides whether to ' +
        'park it; nothing is saved unless they press Park. Mention in one short line that you offered to park it.',
    }
  })

  // Tells Claude when to offer.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!isOffering || !e.tools.includes(`mcp__parked-items__${PARK_TOOL}`)) return composed
    return { ...composed, sections: [...composed.sections, OFFER_SECTION] }
  })

  on('command.run', { command: 'park' }, async ($, e) => {
    await startPark($, e.args.trim(), '')
    return { text: 'Give the item a title in the Parked items pane, then press Park.' }
  })

  on('command.run', { command: 'parked' }, async $ => {
    await refresh($)
    await openPane($)
    const open = (await read($, points)).filter(p => p.status === 'open').length
    return { text: `Parked items opened (${open} open).` }
  })

  // Pick up points parked or changed in other sessions.
  on('prompt.submit', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  // Right-click → Park this, on a message or on selected text (desktop app).
  on('ui.render', { component: 'ContextMenu' }, ($, e, next) => {
    const selected = e.props.selection?.text?.trim()
    const row = e.props.row
    const isMessage = row?.component === 'UserMessage' || row?.component === 'AssistantMessage'
    if (!selected && !isMessage) return next(e)

    const { Button } = $.ui.resolve(e)
    const park = async () => {
      const fromRow = !selected && row ? await messageText($, row.requestId) : undefined
      // The selection, or the message clicked on, goes into the notes.
      const notes = (selected || fromRow?.trim() || '').slice(0, 4000)
      await startPark($, '', notes, notes ? undefined : 'No message text was found. Add details here (optional)')
    }
    return (
      <Button key="park-this" onPress={park}>
        Park item for later
      </Button>
    )
  })

  // The reminder: one clickable line above the prompt. The status line under
  // the prompt takes plain text only, so it can't open the pane.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [list, root, paneOpen] = await Promise.all([read($, points), $.session.root(), read($, isPaneOpen)])
    const open = list.filter(p => p.status === 'open')
    // Nothing to remind of, or the pane is already open.
    if (open.length === 0 || paneOpen) return next(e)

    const here = open.filter(p => p.from.projectPath === root).length
    const { Button } = $.ui.resolve(e)
    return (
      <Button key="parked-reminder" plain dimColor onPress={() => openPane($)}>
        {`◷ ${statusText(here, open.length)}`}
      </Button>
    )
  })

  // The pane was closed: the reminder comes back.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, isPaneOpen, () => false)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const list = await read($, points)
    const v = await read($, view)

    const open = list.filter(p => p.status === 'open')
    const closed = list.filter(p => p.status === 'closed')
    const shown = v.tab === 'open' ? open : closed

    // A labelled field: labels in one column, so the boxes line up at the same width.
    const LABEL = 6
    const columns = e.props.bodyColumns ?? 60
    const field = (key: string, label: string, input: RenderChildren, width: number) => (
      <Box key={`field-${key}`}>
        <Box width={LABEL} flexShrink={0}>
          <Text>{label}</Text>
        </Box>
        <Box width={Math.max(10, width - LABEL)} flexDirection="column" alignItems="stretch">
          {input}
        </Box>
      </Box>
    )
    // The dialog's border and padding take 2 columns on each side.
    const dialogWidth = columns - 2
    const heading = (text: string) => (
      <Text bold dimColor>
        {text.toUpperCase()}
      </Text>
    )
    const divider = (
      <Box width={columns} overflow="hidden">
        <Text dimColor wrap="clip" maxLines={1}>
          {'─'.repeat(Math.max(10, columns - 1))}
        </Text>
      </Box>
    )

    const draft = v.draft
    const draftView = draft && (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Box marginBottom={1}>{heading('Park item for later')}</Box>
          <Box flexDirection="column" rowGap={1}>
            {field(
              'title',
              'Title',
              <Input
                key="park-title"
                rows={2}
                placeholder="What to come back to"
                value={draft.title}
                onInput={title => setDraft($, d => ({ ...d, title }))}
                onSubmit={title => setDraft($, d => ({ ...d, title }))}
              />,
              dialogWidth,
            )}
            {field(
              'notes',
              'Notes',
              <Input
                key="park-notes"
                rows={3}
                placeholder={draft.notesPlaceholder ?? 'Optional details'}
                value={draft.notes}
                onInput={notes => setDraft($, d => ({ ...d, notes }))}
                onSubmit={notes => setDraft($, d => ({ ...d, notes }))}
              />,
              dialogWidth,
            )}
            {field(
              'from',
              'From',
              <Input
                key="park-from"
                rows={2}
                placeholder="Optional: where this came from"
                value={draft.fromLabel}
                onInput={fromLabel => setDraft($, d => ({ ...d, fromLabel }))}
                onSubmit={fromLabel => setDraft($, d => ({ ...d, fromLabel }))}
              />,
              dialogWidth,
            )}
          </Box>
          {draft.status !== 'idle' && (
            <Box flexDirection="column" marginTop={1}>
              {draft.status === 'loading' && <Text dimColor>Claude is suggesting titles…</Text>}
              {draft.status === 'failed' && <Text dimColor>{draft.failure}</Text>}
              {draft.status === 'ready' && <Text dimColor>Suggestions (press one to use it):</Text>}
              {draft.status === 'ready' &&
                draft.candidates.map((c, i) => (
                  <Button key={`suggestion-${i}`} plain onPress={() => useSuggestion($, i)}>
                    {`• ${c.title}`}
                  </Button>
                ))}
            </Box>
          )}
          <Box marginTop={1} paddingTop="xs">
            <Button key="park-save" variant="primary" onPress={() => confirmPark($)}>
              Park
            </Button>
            <Text> </Text>
            <Button key="park-suggest" onPress={() => suggest($)}>
              {draft.status === 'loading' ? 'Suggesting…' : 'Suggest'}
            </Button>
            <Text> </Text>
            <Button key="park-cancel" onPress={() => update($, view, x => ({ ...x, draft: undefined }))}>
              Cancel
            </Button>
          </Box>
        </Box>
        <Box marginY={1}>{divider}</Box>
      </Box>
    )

    const tabs = (
      <Box marginBottom={2}>
        <Button
          key="tab-open"
          variant={v.tab === 'open' ? 'primary' : undefined}
          onPress={() => update($, view, x => ({ ...x, tab: 'open' as const }))}
        >
          Open ({open.length})
        </Button>
        <Text> </Text>
        <Button
          key="tab-closed"
          variant={v.tab === 'closed' ? 'primary' : undefined}
          onPress={() => update($, view, x => ({ ...x, tab: 'closed' as const }))}
        >
          Closed ({closed.length})
        </Button>
        <Text> </Text>
        <Button key="park-new" onPress={() => startPark($, '', '')}>
          + Park
        </Button>
      </Box>
    )

    // Group by project, keeping each group newest first.
    const groups = new Map<string, ParkedPoint[]>()
    for (const p of [...shown].sort((a, b) => b.parkedAt - a.parkedAt)) {
      const key = p.from.project || 'No project'
      groups.set(key, [...(groups.get(key) ?? []), p])
    }

    const item = (p: ParkedPoint) => {
      if (v.editing?.id === p.id) {
        const ed = v.editing
        return (
          <Box key={`item-${p.id}`} flexDirection="column" marginBottom={1}>
            <Box flexDirection="column" rowGap={1}>
              {field(
                `edit-title-${p.id}`,
                'Title',
                <Input
                  key={`edit-title-${p.id}`}
                  rows={2}
                  autoFocus
                  value={ed.title}
                  onInput={title => update($, view, x => (x.editing ? { ...x, editing: { ...x.editing, title } } : x))}
                  onSubmit={title => update($, view, x => (x.editing ? { ...x, editing: { ...x.editing, title } } : x))}
                />,
                columns,
              )}
              {field(
                `edit-notes-${p.id}`,
                'Notes',
                <Input
                  key={`edit-notes-${p.id}`}
                  rows={3}
                  value={ed.notes}
                  onInput={notes => update($, view, x => (x.editing ? { ...x, editing: { ...x.editing, notes } } : x))}
                  onSubmit={notes => update($, view, x => (x.editing ? { ...x, editing: { ...x.editing, notes } } : x))}
                />,
                columns,
              )}
              {field(
                `edit-from-${p.id}`,
                'From',
                <Input
                  key={`edit-from-${p.id}`}
                  rows={2}
                  placeholder="Optional: where this came from"
                  value={ed.chat}
                  onInput={chat => update($, view, x => (x.editing ? { ...x, editing: { ...x.editing, chat } } : x))}
                  onSubmit={chat => update($, view, x => (x.editing ? { ...x, editing: { ...x.editing, chat } } : x))}
                />,
                columns,
              )}
            </Box>
            <Box marginTop={1}>
              <Button
                key={`edit-save-${p.id}`}
                variant="primary"
                onPress={async () => {
                  const cur = (await read($, view)).editing
                  if (!cur || cur.title.trim() === '') {
                    $.ui.toast('An item needs a title.')
                    return
                  }
                  await mutate($, l =>
                    l.map(x =>
                      x.id === cur.id
                        ? {
                            ...x,
                            title: cur.title.trim(),
                            notes: cur.notes.trim(),
                            from: { ...x.from, chat: oneLine(cur.chat, 200) },
                          }
                        : x,
                    ),
                  )
                  await update($, view, x => ({ ...x, editing: undefined }))
                }}
              >
                Save
              </Button>
              <Text> </Text>
              <Button key={`edit-cancel-${p.id}`} onPress={() => update($, view, x => ({ ...x, editing: undefined }))}>
                Cancel
              </Button>
            </Box>
          </Box>
        )
      }

      const isConfirming = v.confirmDelete === p.id
      return (
        <Box key={`item-${p.id}`} flexDirection="column" marginBottom={1}>
          <Text bold dimColor={p.status === 'closed'}>
            {p.title}
          </Text>
          {p.notes !== '' && <Text dimColor>{p.notes}</Text>}
          {p.from.chat !== '' && <Text dimColor>From: {p.from.chat}</Text>}
          <Text dimColor>
            Parked {formatDate(p.parkedAt)}
            {p.closedAt ? ` · closed ${formatDate(p.closedAt)}` : ''}
          </Text>
          {isConfirming ? (
            <Box marginTop={1}>
              <Text>Delete this item? </Text>
              <Button
                key={`delete-yes-${p.id}`}
                variant="primary"
                onPress={async () => {
                  await mutate($, l => l.filter(x => x.id !== p.id))
                  await update($, view, x => ({ ...x, confirmDelete: undefined }))
                }}
              >
                Delete
              </Button>
              <Text> </Text>
              <Button key={`delete-no-${p.id}`} onPress={() => update($, view, x => ({ ...x, confirmDelete: undefined }))}>
                Keep
              </Button>
            </Box>
          ) : (
            <Box marginTop={1}>
              <Button
                key={`edit-${p.id}`}
                onPress={() =>
                  update($, view, x => ({
                    ...x,
                    confirmDelete: undefined,
                    editing: { id: p.id, title: p.title, notes: p.notes, chat: p.from.chat },
                  }))
                }
              >
                Edit
              </Button>
              <Text> </Text>
              {p.status === 'open' ? (
                <Button
                  key={`close-${p.id}`}
                  onPress={async () => {
                    const closedAt = await $.clock.now()
                    await mutate($, l => l.map(x => (x.id === p.id ? { ...x, status: 'closed', closedAt } : x)))
                  }}
                >
                  Close
                </Button>
              ) : (
                <Button
                  key={`reopen-${p.id}`}
                  onPress={() =>
                    mutate($, l => l.map(x => (x.id === p.id ? { ...x, status: 'open', closedAt: undefined } : x)))
                  }
                >
                  Reopen
                </Button>
              )}
              <Text> </Text>
              <Button
                key={`delete-${p.id}`}
                onPress={() => update($, view, x => ({ ...x, editing: undefined, confirmDelete: p.id }))}
              >
                Delete
              </Button>
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {draftView}
        {tabs}
        {shown.length === 0 && (
          <Text dimColor>
            {v.tab === 'open'
              ? 'Nothing parked. Type /park in a chat to park a follow-up.'
              : 'No closed items.'}
          </Text>
        )}
        {[...groups].map(([project, items]) => (
          <Box key={`group-${project}`} flexDirection="column">
            <Box marginBottom={1}>{heading(projectName(project))}</Box>
            {items.map(item)}
          </Box>
        ))}
        <Box marginTop={2}>
          <Text dimColor>
            {TITLE} {await version($)}
          </Text>
        </Box>
      </Box>
    )
  })
}
