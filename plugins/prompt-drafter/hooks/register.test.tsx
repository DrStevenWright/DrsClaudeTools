import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'prompt-drafter',
  component: 'Pane',
  requestId: 'prompt-drafter',
  props: {
    title: 'Prompt draft',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The parts of a mounted drawing the helpers use, on any surface.
type Mounted = {
  find(query: { type: string; text?: RegExp }): Promise<
    { key: string | undefined; text: string; props: Record<string, unknown> } | undefined
  >
  input(args: { key: string; text: string; kind?: 'change' | 'submit' }): Promise<unknown>
  press(args: { key: string }): Promise<unknown>
}

// The field's key changes whenever the mod sets the text, so look it up.
async function editor(ui: Mounted) {
  const found = await ui.find({ type: 'Input' })
  if (!found?.key) throw new Error('no editor field drawn')
  return { ...found, key: found.key }
}
async function type(ui: Mounted, text: string) {
  const { key } = await editor(ui)
  await ui.input({ key, text, kind: 'change' })
}
async function preview(ui: Mounted) {
  return (await ui.find({ type: 'Markdown' }))?.text
}
const tab = (ui: Mounted, mode: 'write' | 'preview' | 'split') => ui.press({ key: `tab-${mode}` })

test('Write is the default: the editor fills the pane and nothing else scrolls', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await editor(ui)).props.rows).toBe(28)
  await type(ui, 'Some text')
  await clock.advance(500)
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Nothing to preview/ })).toBeUndefined()
  await ui.unmount()
})

test('Preview shows what was just typed, and Write gets it back', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await type(ui, '## Plan\n- step one')
  await tab(ui, 'preview')
  expect(await preview(ui)).toBe('## Plan\n- step one')
  expect(await ui.find({ type: 'Input' })).toBeUndefined()

  await tab(ui, 'write')
  expect((await editor(ui)).props.value).toBe('## Plan\n- step one')
  await ui.unmount()
})

test('the tab chosen is remembered for later sessions', async ($, on) => {
  mock.store(on, { mode: 'preview' })
  on('command.register', () => ({ value: { command: 'draft' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  await ui.unmount()
})

test('Split: typing leaves the field alone; the preview catches up after a pause', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await tab(ui, 'split')

  const before = await editor(ui)
  await type(ui, 'Fix the')
  await type(ui, 'Fix the splash')
  const during = await editor(ui)

  // The field is drawn exactly as before: same key, same value.
  expect(during.key).toBe(before.key)
  expect(during.props.value).toBe(before.props.value)
  expect(await preview(ui)).toBeUndefined()

  await clock.advance(500)
  expect(await preview(ui)).toBe('Fix the splash')
  expect((await editor(ui)).key).toBe(before.key)
  await ui.unmount()
})

test('a toolbar button appends, send fills the prompt box', async ($, on) => {
  const fills: string[] = []
  mock.store(on)
  mock.clock(on)
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  on('ui.toast', () => ({ value: undefined }))

  for (const surface of ['terminal', 'desktop'] as const) {
    fills.length = 0
    const ui = await $.ui.mount({ ...PANE, surface })
    await tab(ui, 'split')

    expect((await ui.find({ type: 'Text', text: /Nothing to preview/ }))?.text).toBe(
      'Nothing to preview yet.',
    )

    // No pause: the button must still see the newest typed text.
    await type(ui, 'Fix the splash')
    await ui.press({ key: 'bullet' })
    expect(await preview(ui)).toBe('Fix the splash\n- ')
    expect((await editor(ui)).props.value).toBe('Fix the splash\n- ')

    await ui.press({ key: 'send' })
    expect(fills).toEqual(['Fix the splash\n- '])
    expect((await ui.find({ type: 'Text', text: /Nothing to preview/ }))?.text).toBe(
      'Nothing to preview yet.',
    )
    expect((await editor(ui)).props.value).toBe('')
    await ui.unmount()
  }
})

test('Clear empties a field that was only typed into', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const before = await editor(ui)
  await type(ui, 'typed but never set by the mod')
  await ui.press({ key: 'clear' })
  const after = await editor(ui)

  expect(after.key).not.toBe(before.key)
  expect(after.props.value).toBe('')
  await ui.unmount()
})

test('the Quote button starts a quoted line', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await tab(ui, 'split')

  await type(ui, 'The log said:')
  await ui.press({ key: 'quote' })
  expect(await preview(ui)).toBe('The log said:\n> ')

  // Another button after a quote line ends the quote with a blank line first.
  await type(ui, 'The log said:\n> Error 42')
  await ui.press({ key: 'bullet' })
  expect(await preview(ui)).toBe('The log said:\n> Error 42\n\n- ')

  // A second Quote press keeps the quote going.
  await type(ui, '> a')
  await ui.press({ key: 'quote' })
  expect(await preview(ui)).toBe('> a\n> ')
  await ui.unmount()
})

test('the List button continues the numbering of the list above it', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await tab(ui, 'split')

  await type(ui, 'Steps:')
  await ui.press({ key: 'numbered' })
  await type(ui, 'Steps:\n1. First')
  await ui.press({ key: 'numbered' })
  await type(ui, 'Steps:\n1. First\n2. Second\n  7. Nested')
  await ui.press({ key: 'numbered' })

  expect(await preview(ui)).toBe('Steps:\n1. First\n2. Second\n  7. Nested\n  8. ')
  await ui.unmount()
})

const MENU = {
  plugin: 'prompt-drafter',
  component: 'ContextMenu',
  requestId: 'menu-1',
  props: {},
  surface: 'desktop',
} as const

test('the right-click menu offers to open the pane while it is closed', async ($, on) => {
  const opened: string[] = []
  type Pane = { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }
  let panes: Pane[] = []
  on('ui.panes', () => ({ value: panes }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    panes = [{ id: e.id, title: 'Prompt draft', isShown: true, isFocused: true, isPlaced: true }]
    return { value: { isPlaced: true } }
  })

  const menu = await $.ui.mount(MENU)
  expect((await menu.find({ type: 'Button', text: /Open prompt drafter/ }))?.key).toBe(
    'prompt-drafter:open',
  )
  await menu.press({ key: 'prompt-drafter:open' })
  expect(opened).toEqual(['prompt-drafter'])
  await menu.unmount()

  // Once the pane is open, the menu leaves the entry out.
  const again = await $.ui.mount({ ...MENU, requestId: 'menu-2' })
  expect(await again.find({ type: 'Button', text: /Open prompt drafter/ })).toBeUndefined()
  await again.unmount()
})

test('the right-click menu also offers the pane while it is hidden', async ($, on) => {
  on('ui.panes', () => ({
    value: [{ id: 'prompt-drafter', title: 'Prompt draft', isShown: false, isFocused: false, isPlaced: true }],
  }))

  const menu = await $.ui.mount(MENU)
  expect((await menu.find({ type: 'Button', text: /Open prompt drafter/ }))?.key).toBe(
    'prompt-drafter:open',
  )
  await menu.unmount()
})

test('Close saves what was typed and closes the pane', async ($, on) => {
  const stored: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: stored[e.key] }))
  on('store.set', (_, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  mock.clock(on)
  const closed: string[] = []
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await type(ui, 'Unsaved words')
  await ui.press({ key: 'close' })

  expect(closed).toEqual(['prompt-drafter'])
  expect(stored.draft).toBe('Unsaved words')
  await ui.unmount()
})

test('the pane and /draft show the installed version from plugin.json', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  // The path comes with the platform's separators, so match either.
  on('fs.read', (_, e) => ({
    value: /[\\/]\.claude-plugin[\\/]plugin\.json$/.test(e.path) ? '{"version":"9.8.7"}' : '',
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /prompt-drafter v/ }))?.text).toBe(
      'prompt-drafter v9.8.7',
    )
    await ui.unmount()
  }

  const ran = await $.command.run({
    command: 'draft',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  expect(ran.text).toBe('Prompt draft pane opened (v9.8.7).')
})
