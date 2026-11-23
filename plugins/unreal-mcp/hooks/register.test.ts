import { expect, mock, test } from 'claude-code/testing'

const RUN = {
  command: 'unreal-mcp',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

test('/unreal-mcp shows the version, this session\'s status and the URL', async ($, on) => {
  const clock = mock.clock(on)
  // The path comes with the platform's separators, so match either.
  on('fs.read', (_, e) => {
    if (/[\\/]\.claude-plugin[\\/]plugin\.json$/.test(e.path)) return { value: '{"version":"9.8.7"}' }
    throw new Error('no such file')
  })
  on('fs.list', () => ({ value: [{ name: 'Game.uproject' }] }))
  on('settings.read', () => ({ value: {} }))
  on('http.fetch', () => ({ value: { status: 200 } }))
  on('tool.list', () => ({ value: [{ name: 'mcp__plugin_unreal-mcp_unreal-mcp__list_toolsets' }] }))
  on('session.id', () => ({ value: 'session-1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/game', surface: 'desktop', isInteractive: true })
  // Let the first check, which session.start leaves running, finish.
  await clock.settle()

  const ran = await $.command.run(RUN)
  expect(ran.text).toBe('unreal-mcp v9.8.7 · ● connected · http://127.0.0.1:8000/mcp')
})

test('/unreal-mcp before the first check has finished says so', async ($, on) => {
  mock.clock(on)
  on('fs.read', () => ({ value: '{"version":"9.8.7"}' }))
  on('session.id', () => ({ value: 'session-2' }))

  const ran = await $.command.run(RUN)
  expect(ran.text).toBe('unreal-mcp v9.8.7 · checking… · http://127.0.0.1:8000/mcp')
})

test('a copy added with claude mcp add, which .mcp.json doesn\'t show, counts as connected twice', async ($, on) => {
  const clock = mock.clock(on)
  on('fs.read', (_, e) => {
    if (/[\/]\.claude-plugin[\/]plugin\.json$/.test(e.path)) return { value: '{"version":"9.8.7"}' }
    throw new Error('no such file')
  })
  on('fs.list', () => ({ value: [{ name: 'Game.uproject' }] }))
  on('settings.read', () => ({ value: {} }))
  on('http.fetch', () => ({ value: { status: 200 } }))
  on('tool.list', () => ({ value: [
    { name: 'mcp__plugin_unreal-mcp_unreal-mcp__list_toolsets' },
    { name: 'mcp__unreal-mcp__list_toolsets' },
  ] }))
  on('session.id', () => ({ value: 'session-3' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/game', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ran = await $.command.run(RUN)
  expect(ran.text).toContain('· ⚠ connected twice ⓘ ·')
})
