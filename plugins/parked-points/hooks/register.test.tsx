import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'parked-points',
  component: 'Pane',
  requestId: 'parked-points',
  props: {
    title: 'Parked Points',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'parked-points',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

/** A point parked earlier, in this project. */
const PARKED = {
  id: 'p1',
  title: 'Something to do',
  notes: '',
  status: 'open',
  parkedAt: Date.UTC(2026, 10, 26, 12),
  from: { sessionId: 'old', projectPath: '/home/someone/example-project', project: 'example-project', chat: '' },
}

const MENU = { plugin: 'parked-points', surface: 'desktop', component: 'ContextMenu' } as const

const REPLY =
  '[{"title": "Fix the flaky login test", "notes": "It fails about one run in ten."},' +
  ' {"title": "Speed up the build", "notes": "Cache the dependencies."}]'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

type Stored = { id: string; title: string; notes: string; from: { chat: string } }[]

/** The engine beneath the mod, with what the mod sent Claude and stored. */
function engine(on: On, reply = REPLY, seed: unknown[] = []) {
  const asked: string[] = []
  const store: Record<string, unknown> = seed.length > 0 ? { 'points-v1': seed } : {}
  let opened = 0
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  mock.clock(on, { now: Date.UTC(2026, 10, 27, 12) })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  const tools: string[] = []
  on('tool.register', (_, e) => {
    tools.push(e.name)
    return { value: { tool: `mcp__parked-points__${e.name}` } }
  })
  on('ui.open', () => {
    opened += 1
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.panes', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.root', () => ({ value: '/home/someone/example-project' }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'Help me tidy up the test suite', toolUses: [], uuid: 'm1' },
      { role: 'assistant', text: 'Later we should also split the slow tests out.', toolUses: [], uuid: 'm2' },
    ],
  }))
  on('model.complete', (_, e) => {
    asked.push(String(e.prompt))
    return { value: { isAnswered: true as const, text: reply, usage } }
  })
  on('model.fork', (_, e) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true as const, text: reply, usage } }
  })

  return {
    asked,
    tools,
    stored: () => (store['points-v1'] ?? []) as Stored,
    opened: () => opened,
  }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`/park opens the dialog without asking Claude, and parks what you type (${surface})`, async ($, on) => {
    const world = engine(on)
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    await $.command.run({ command: 'park', args: 'the flaky login test', ...RUN })
    expect(world.asked.length).toBe(0)

    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /PARK ITEM FOR LATER/ }))?.text).toBe('PARK ITEM FOR LATER')

    await ui.input({ key: 'park-title', text: 'Fix the flaky login test', kind: 'change' })
    await ui.input({ key: 'park-notes', text: 'Ask first', kind: 'change' })
    await ui.press({ key: 'park-save' })

    expect(world.stored()[0]?.title).toBe('Fix the flaky login test')
    expect(world.stored()[0]?.notes).toBe('Ask first')
    expect(await ui.find({ type: 'Text', text: /PARK ITEM FOR LATER/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /EXAMPLE PROJECT/ }))?.text).toBe('EXAMPLE PROJECT')
    expect((await ui.find({ type: 'Text', text: /^Parked 27 Nov 2026$/ }))?.text).toBe('Parked 27 Nov 2026')
    await ui.unmount()
  })
}

test('Park needs a title', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'park', args: '', ...RUN })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'park-save' })
  expect(world.stored().length).toBe(0)
  await ui.unmount()
})

test('Suggest asks Claude, and a suggestion fills the title and empty notes', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'park', args: '', ...RUN })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'park-suggest' })
  expect(world.asked.at(-1)).toContain('They gave no description')

  await ui.press({ key: 'suggestion-1' })
  await ui.press({ key: 'park-save' })
  expect(world.stored()[0]?.title).toBe('Speed up the build')
  expect(world.stored()[0]?.notes).toBe('Cache the dependencies.')
  await ui.unmount()
})

test('a suggestion keeps notes you already have', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'park', args: '', ...RUN })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.input({ key: 'park-notes', text: 'My own notes', kind: 'change' })
  await ui.press({ key: 'park-suggest' })
  expect(world.asked.at(-1)).toContain('My own notes')
  await ui.press({ key: 'suggestion-0' })
  await ui.press({ key: 'park-save' })
  expect(world.stored()[0]?.title).toBe('Fix the flaky login test')
  expect(world.stored()[0]?.notes).toBe('My own notes')
  await ui.unmount()
})

test('a point can be edited, closed, reopened and deleted', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'park', args: 'Fix the login test', ...RUN })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'park-title', text: 'Fix the login test', kind: 'change' })
  await ui.press({ key: 'park-save' })
  const id = world.stored()[0]?.id ?? ''

  await ui.press({ key: `edit-${id}` })
  await ui.input({ key: `edit-title-${id}`, text: 'Fix the login test for good', kind: 'change' })
  await ui.press({ key: `edit-save-${id}` })
  expect((await ui.find({ type: 'Text', text: /for good/ }))?.text).toBe('Fix the login test for good')

  await ui.press({ key: `close-${id}` })
  expect((await ui.find({ type: 'Text', text: /Nothing parked/ }))?.text).toContain('Nothing parked')
  await ui.press({ key: 'tab-closed' })
  await ui.press({ key: `reopen-${id}` })
  await ui.press({ key: 'tab-open' })

  await ui.press({ key: `delete-${id}` })
  expect((await ui.find({ type: 'Text', text: /Delete this point/ }))?.text).toBe('Delete this point? ')
  await ui.press({ key: `delete-yes-${id}` })
  expect(world.stored().length).toBe(0)
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the reminder counts this project's points, opens the pane, and steps aside while it's open (${surface})`, async ($, on) => {
    const world = engine(on, REPLY, [PARKED])
    await $.session.start({ cwd: '/', surface, isInteractive: true })

    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ key: 'parked-reminder' }))?.text).toContain('1 parked issue (1 total)')

    await band.press({ key: 'parked-reminder' })
    expect(world.opened()).toBe(1)
    expect(await band.find({ key: 'parked-reminder' })).toBeUndefined()
    await band.unmount()
  })
}

test('no reminder while nothing is parked', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'parked-reminder' })).toBeUndefined()
  await band.unmount()
})

test('right-click on selected text puts it in the notes, without asking Claude', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const menu = await $.ui.mount({ ...MENU, props: { selection: { text: 'rename the config flag' } } })
  await menu.press({ key: 'park-this' })
  expect(world.asked.length).toBe(0)

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.input({ key: 'park-title', text: 'Rename the flag', kind: 'change' })
  await pane.press({ key: 'park-save' })
  expect(world.stored()[0]?.notes).toBe('rename the config flag')
  await pane.unmount()
  await menu.unmount()
})

test('right-click on a message puts the message in the notes', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const menu = await $.ui.mount({ ...MENU, props: { row: { component: 'AssistantMessage', requestId: 'm2' } } })
  await menu.press({ key: 'park-this' })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.input({ key: 'park-title', text: 'Split the slow tests', kind: 'change' })
  await pane.press({ key: 'park-save' })
  expect(world.stored()[0]?.notes).toBe('Later we should also split the slow tests out.')
  await pane.unmount()
  await menu.unmount()
})

test('right-click on anything else adds no row', async ($, on) => {
  engine(on)
  const menu = await $.ui.mount({ ...MENU, props: { link: { href: 'https://example.com' } } })
  expect(await menu.find({ key: 'park-this' })).toBeUndefined()
  await menu.unmount()
})

test("the pane's Park button opens the dialog", async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'park-new' })
  await pane.input({ key: 'park-title', text: 'A thing to do', kind: 'change' })
  await pane.press({ key: 'park-save' })
  expect(world.stored()[0]?.title).toBe('A thing to do')
  await pane.unmount()
})

test('picking another suggestion replaces notes a suggestion filled, but not your own', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'park', args: '', ...RUN })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'park-suggest' })
  await ui.press({ key: 'suggestion-0' })
  await ui.press({ key: 'suggestion-1' })
  await ui.press({ key: 'park-save' })
  expect(world.stored()[0]?.notes).toBe('Cache the dependencies.')

  await $.command.run({ command: 'park', args: '', ...RUN })
  await ui.press({ key: 'park-suggest' })
  await ui.press({ key: 'suggestion-0' })
  await ui.input({ key: 'park-notes', text: 'Edited by me', kind: 'change' })
  await ui.press({ key: 'suggestion-1' })
  await ui.press({ key: 'park-save' })
  expect(world.stored()[0]?.notes).toBe('Edited by me')
  await ui.unmount()
})

test('From starts as the first words of the chat, can be changed, and is left out when blank', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await $.command.run({ command: 'park', args: 'First point', ...RUN })
  await ui.press({ key: 'park-save' })
  expect(world.stored()[0]?.from.chat).toBe('Help me tidy up the test suite')

  await $.command.run({ command: 'park', args: 'Second point', ...RUN })
  await ui.input({ key: 'park-from', text: 'Test suite clean-up', kind: 'change' })
  await ui.press({ key: 'park-save' })
  expect((await ui.find({ type: 'Text', text: /From: Test suite clean-up/ }))?.text).toBe('From: Test suite clean-up')

  await $.command.run({ command: 'park', args: 'Third point', ...RUN })
  await ui.input({ key: 'park-from', text: '', kind: 'change' })
  await ui.press({ key: 'park-save' })
  const third = world.stored()[0] ?? { id: '', from: { chat: 'missing' } }
  expect(third.from.chat).toBe('')

  await ui.press({ key: `edit-${third.id}` })
  await ui.input({ key: `edit-from-${third.id}`, text: 'Added later', kind: 'change' })
  await ui.press({ key: `edit-save-${third.id}` })
  expect(world.stored()[0]?.from.chat).toBe('Added later')
  await ui.unmount()
})


test("Claude's offer opens the dialog filled in, and saves nothing until Park", { options: { offerToPark: true } }, async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(world.tools).toEqual(['park'])
  const ran = await $.tool.call({
    tool: 'mcp__parked-points__park',
    title: 'Upgrade the test runner',
    notes: 'Blocked until the new version is out.',
  })
  expect(JSON.stringify(ran)).toContain('Opened the park dialog')
  expect(world.stored().length).toBe(0)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'park-save' })
  expect(world.stored()[0]?.title).toBe('Upgrade the test runner')
  expect(world.stored()[0]?.notes).toBe('Blocked until the new version is out.')
  await ui.unmount()
})

test("Claude's offer doesn't replace a dialog that's already open", { options: { offerToPark: true } }, async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'park', args: 'Mine', ...RUN })
  const ran = await $.tool.call({ tool: 'mcp__parked-points__park', title: 'Theirs' })
  expect(JSON.stringify(ran)).toContain('already open')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'park-save' })
  expect(world.stored()[0]?.title).toBe('Mine')
  await ui.unmount()
})

test('the system prompt tells Claude when to offer, while the tool is offered', { options: { offerToPark: true } }, async ($, on) => {
  engine(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'Hello', scope: 'shared' as const }] }))
  const base = { model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, traits: [] }

  const withTool = await $.prompt.compose({ ...base, tools: ['mcp__parked-points__park'] })
  expect(withTool.sections.map(s => s.id)).toEqual(['intro', 'parked-points:offer'])

  const without = await $.prompt.compose({ ...base, tools: [] })
  expect(without.sections.map(s => s.id)).toEqual(['intro'])
})

test('offers are off by default: no tool, no instruction, and a stray call is refused', async ($, on) => {
  const world = engine(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'Hello', scope: 'shared' as const }] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(world.tools).toEqual([])

  const base = { model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, traits: [] }
  const composed = await $.prompt.compose({ ...base, tools: ['mcp__parked-points__park'] })
  expect(composed.sections.map(s => s.id)).toEqual(['intro'])

  const ran = await $.tool.call({ tool: 'mcp__parked-points__park', title: 'Anything' })
  expect(JSON.stringify(ran)).toContain('turned off')
  expect(world.stored().length).toBe(0)
})

test('the pane is called Parked items and shows the version at the bottom', async ($, on) => {
  engine(on)
  on('fs.read', () => ({ value: JSON.stringify({ name: 'parked-points', version: '0.1.0' }) }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Parked items v\d+\.\d+\.\d+$/ }))?.text).toBe('Parked items v0.1.0')
  await ui.unmount()
})

test('right-click reads Park item for later, with no line under it', async ($, on) => {
  engine(on)
  const onMessage = await $.ui.mount({ ...MENU, props: { row: { component: 'UserMessage', requestId: 'm1' } } })
  expect((await onMessage.find({ key: 'park-this' }))?.text).toBe('Park item for later')
  await onMessage.unmount()
})

test('when no message text is found, the empty Notes box says so', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const menu = await $.ui.mount({ ...MENU, props: { row: { component: 'AssistantMessage', requestId: 'gone' } } })
  await menu.press({ key: 'park-this' })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(JSON.stringify(await pane.find({ key: 'park-notes' }))).toContain('No message text was found')

  await $.command.run({ command: 'park', args: '', ...RUN })
  expect(JSON.stringify(await pane.find({ key: 'park-notes' }))).toContain('Optional details')
  await pane.unmount()
  await menu.unmount()
})
