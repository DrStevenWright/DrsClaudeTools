import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DraftMode } from '../types'

const PANE = 'prompt-drafter'
const STORE_KEY = 'draft'
const MODE_STORE_KEY = 'mode'
// How long typing must pause before the preview (and saved draft) catch up.
const PREVIEW_DELAY_MS = 400
// Rows the Write tab spends on everything but the editor (tabs, toolbar,
// bottom buttons and the gaps between), with some slack for a wrapped toolbar,
// so the pane never grows past its window and never scrolls itself.
const WRITE_OVERHEAD_ROWS = 10

// The draft as the preview and the saved copy know it; mirrored to $.store so
// it survives restarts. Typing reaches it only after a pause.
const draft = atom({ plugin: 'prompt-drafter', key: 'draft' } as const, '')
// What the editor field is drawn holding. It changes only when the mod itself
// sets the text (a button, Clear, Send, a tab switch, a restored draft), never
// while you type: redrawing the field with new text resets it mid-typing.
// `gen` gives the field a fresh key on each such change, so even the same text
// (Clear on an unsaved draft) is drawn afresh.
const field = atom({ plugin: 'prompt-drafter', key: 'field' } as const, { text: '', gen: 0 })
// Write: the editor alone, filling the pane. Preview: the rendered draft
// alone. Split: editor with the live preview below it (the pane may scroll).
const mode = atom({ plugin: 'prompt-drafter', key: 'mode' } as const, 'write' as DraftMode)

// The newest text typed into the field, ahead of the debounced `draft`.
let latest: string | undefined
let typingToken = 0

const SNIPPETS = {
  bullet: '- ',
  numbered: '1. ',
  code: '```cpp\n\n```\n',
  heading: '## ',
  quote: '> ',
} as const

const MODES: { mode: DraftMode; label: string }[] = [
  { mode: 'write', label: 'Write' },
  { mode: 'preview', label: 'Preview' },
  { mode: 'split', label: 'Split' },
]

function isMode(value: unknown): value is DraftMode {
  return value === 'write' || value === 'preview' || value === 'split'
}

function appendSnippet(text: string, snippet: string): string {
  if (text.length === 0) return snippet
  const base = text.endsWith('\n') ? text : text + '\n'
  // Markdown carries a quote on until a blank line, so anything other than
  // another quote line added after a quote gets a blank line first.
  const lines = base.split('\n')
  const lastLine = lines[lines.length - 2] ?? ''
  if (/^\s*>/.test(lastLine) && !snippet.startsWith('>')) return base + '\n' + snippet
  return base + snippet
}

// The next item of a numbered list: one past the last line's number (keeping
// its indent) when the draft's last non-empty line is a numbered item, else 1.
function nextNumberedItem(text: string): string {
  const lines = text.split('\n')
  let i = lines.length - 1
  while (i >= 0 && (lines[i] ?? '').trim() === '') i--
  const match = i >= 0 ? /^(\s*)(\d+)[.)]\s/.exec(lines[i] ?? '') : null
  return match ? `${match[1] ?? ''}${Number(match[2]) + 1}. ` : SNIPPETS.numbered
}

const editorKey = (gen: number) => `editor-${gen}`

async function currentText($: EngineInterface): Promise<string> {
  return latest ?? (await read($, draft))
}

// Typing: remember the text now, let the preview and the save catch up once
// typing pauses. Nothing the field is drawn from changes, so it is not reset.
function onTyped($: EngineInterface, value: string): void {
  latest = value
  const token = ++typingToken
  void $.clock
    .sleep(PREVIEW_DELAY_MS)
    .then(async () => {
      if (token !== typingToken) return
      await update($, draft, () => value)
      await $.store.set(STORE_KEY, value)
    })
    // A wait cut short (the mod reloading, the session ending) just drops it.
    .catch(() => undefined)
}

// The mod sets the text: redraw the field with it and put the focus back.
async function setText($: EngineInterface, value: string): Promise<void> {
  latest = value
  typingToken++
  await update($, draft, () => value)
  const shown = await read($, field)
  const gen = shown.gen + 1
  await update($, field, () => ({ text: value, gen }))
  await $.store.set(STORE_KEY, value)
  void $.ui.focus({ requestId: PANE, key: editorKey(gen) }).catch(() => undefined)
}

// Switching tabs: bring the draft and the field up to date with what was typed
// (the field is redrawn when the editor comes back), then change the tab.
async function setMode($: EngineInterface, next: DraftMode): Promise<void> {
  if ((await read($, mode)) === next) return
  await setText($, await currentText($))
  await update($, mode, () => next)
  await $.store.set(MODE_STORE_KEY, next)
}

// Bumped whenever the pane opens or closes. The right-click menu reads it, so
// the menu is asked again then instead of reusing a stale answer.
const paneChanges = atom({ plugin: 'prompt-drafter', key: 'paneChanges' } as const, 0)

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: 'Prompt draft', focus: true })
  await update($, paneChanges, n => n + 1)
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(pane => pane.id === PANE)
  } catch {
    return false
  }
}

function bodyRows(e: { props?: unknown; viewport?: { rows?: number } }): number {
  const scroll = (e.props as { scroll?: { bodyRows?: number } } | undefined)?.scroll
  return scroll?.bodyRows ?? e.viewport?.rows ?? 30
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'draft',
      description: 'Open the prompt drafting pane',
    })

    // Restore the last saved draft into this session if it has none yet.
    const saved = await $.store.get(STORE_KEY)
    if (typeof saved === 'string' && saved.length > 0) {
      const current = await read($, draft)
      if (current.length === 0) await update($, draft, () => saved)
    }
    // A field never drawn from the draft yet (a new session, or a session
    // whose draft predates the field) starts out holding the draft.
    const shown = await read($, field)
    const current = await read($, draft)
    if (shown.gen === 0 && current.length > 0) {
      await update($, field, () => ({ text: current, gen: 1 }))
    }
    // The tab last chosen.
    const savedMode = await $.store.get(MODE_STORE_KEY)
    if (isMode(savedMode)) await update($, mode, () => savedMode)

    return next(e)
  })

  on('command.run', { command: 'draft' }, async $ => {
    await openPane($)

    return { text: 'Prompt draft pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) await update($, paneChanges, n => n + 1)

    return closed
  })

  // Right-click menu (desktop app): offer to open the pane while it isn't open.
  on('ui.render', { component: 'ContextMenu' }, async ($, e, next) => {
    await read($, paneChanges)
    if (await isPaneOpen($)) return next(e)

    const { Button, Text } = $.ui.resolve(e)

    return (
      <Button key="prompt-drafter:open" label="Open prompt drafter" onPress={() => void openPane($)}>
        Open prompt drafter <Text dimColor>· Draft and format a prompt before sending it</Text>
      </Button>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Markdown } = $.ui.resolve(e)
    if (!Input) {
      return <Text dimColor>This surface cannot draw a text field.</Text>
    }

    const current = await read($, mode)
    const text = await read($, draft)
    const shown = await read($, field)
    const rows = bodyRows(e)
    const editorRows =
      current === 'split'
        ? Math.max(6, Math.min(20, Math.floor(rows / 2) - 4))
        : Math.max(6, rows - WRITE_OVERHEAD_ROWS)

    const add = (snippet: string | ((current: string) => string)) => () => {
      void currentText($).then(now =>
        setText($, appendSnippet(now, typeof snippet === 'string' ? snippet : snippet(now))),
      )
    }

    const tabs = (
      <Box flexDirection="row" gap={1}>
        {MODES.map(m => (
          <Button
            key={`tab-${m.mode}`}
            label={m.label}
            variant={m.mode === current ? 'primary' : 'secondary'}
            onPress={() => void setMode($, m.mode)}
          />
        ))}
      </Box>
    )

    const previewBody =
      text.trim().length > 0 ? (
        <Markdown key="preview" text={text} />
      ) : (
        <Text dimColor>Nothing to preview yet.</Text>
      )

    if (current === 'preview') {
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {previewBody}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}

        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button key="bullet" label="• Bullet" onPress={add(SNIPPETS.bullet)} />
          <Button key="numbered" label="1. List" onPress={add(nextNumberedItem)} />
          <Button key="code" label="{ } Code block" onPress={add(SNIPPETS.code)} />
          <Button key="heading" label="# Heading" onPress={add(SNIPPETS.heading)} />
          <Button key="quote" label="❝ Quote" onPress={add(SNIPPETS.quote)} />
        </Box>

        <Input
          key={editorKey(shown.gen)}
          placeholder="Draft your prompt in Markdown. Shift+Enter for a new line."
          value={shown.text}
          rows={editorRows}
          submitLabel="Save"
          autoFocus
          onInput={value => onTyped($, value)}
          onSubmit={value => onTyped($, value)}
        />

        <Box flexDirection="row" gap={1}>
          <Button
            key="send"
            label="Send to prompt box"
            variant="primary"
            onPress={() => {
              void (async () => {
                const now = await currentText($)
                if (now.trim().length === 0) {
                  $.ui.toast('The draft is empty.')
                  return
                }
                const filled = await $.prompt.fill({ text: now, mode: 'replace' })
                if (filled.isFilled) {
                  await setText($, '')
                  $.ui.toast('Draft moved to the prompt box. Review it, then press Enter to send.')
                } else {
                  $.ui.toast(
                    filled.refusal === 'dialog'
                      ? 'A dialog is open; close it and try again.'
                      : 'Could not fill the prompt box. Use Copy instead.',
                  )
                }
              })()
            }}
          />
          <Button
            key="copy"
            label="Copy"
            onPress={press => {
              void (async () => {
                const now = await currentText($)
                const copied = await $.ui.copy({ text: now, surface: press.surface })
                $.ui.toast(copied.isCopied ? 'Draft copied.' : 'Could not copy the draft.')
              })()
            }}
          />
          <Button key="clear" label="Clear" onPress={() => void setText($, '')} />
        </Box>

        {current === 'split' && <Text dimColor>Preview</Text>}
        {current === 'split' && previewBody}
      </Box>
    )
  })
}
