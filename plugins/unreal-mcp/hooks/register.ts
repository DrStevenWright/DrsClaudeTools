import type { Register, EngineInterface, PluginOptions } from 'claude-code'

// The default of the endpoint_url setting, which the plugin's .mcp.json also
// uses as its server's url (${user_config.endpoint_url}).
const DEFAULT_ENDPOINT = 'http://127.0.0.1:8000/mcp'
// The server's key in the plugin's own .mcp.json.
const SERVER_NAME = 'unreal-mcp'
const POLL_MS = 15_000
// Once connected, only every second tick checks again (30 s).
const CONNECTED_EVERY_N_TICKS = 2

// Checks in a row with the editor up and no tools before the Reconnect toast
// shows, so Claude Code's own reconnect can finish first. A session that was
// connected before reconnects by itself, so it waits longer.
const RECONNECT_AFTER_CHECKS = 2
const RECONNECT_AFTER_CHECKS_IF_WAS_CONNECTED = 4

// urlUnset: endpoint_url is saved as an empty string (possible from 0.5.0,
// where empty meant "use the default"). The plugin's .mcp.json substitutes it
// as the server's url, and the substitution has no fallback (tested), so the
// server can't connect until the setting is fixed.
type Settings = { endpoint: string; urlUnset: boolean }

function readSettings(options: PluginOptions): Settings {
  const saved = typeof options.endpoint_url === 'string' ? options.endpoint_url.trim() : undefined
  return { endpoint: saved || DEFAULT_ENDPOINT, urlUnset: saved === '' }
}

type ProjectEntry =
  | { kind: 'absent' }                              // no .mcp.json, or it lists no Unreal server
  | { kind: 'unreadable'; detail: string }          // .mcp.json exists but isn't valid JSON
  // entry: the server under its configured name, if listed. aliases: other names
  // in .mcp.json at the plugin server's URL (a renamed or duplicated entry).
  | { kind: 'found'; entry: Record<string, unknown> | undefined; aliases: string[] }

// The parser's error as "line L, column C: message", or the bare message when
// it gives no position. Handles both V8 forms ("at position N" and "(line L column C)").
function describeJsonError(text: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const lineCol = /\(line (\d+) column (\d+)\)/.exec(raw)
  const position = /at position (\d+)/.exec(raw)
  const message = raw
    .replace(/\s*\(line \d+ column \d+\)/, '')
    .replace(/\s*in JSON at position \d+/, '')
    .replace(/\s*at position \d+/, '')
    .trim()
  if (lineCol) return `line ${lineCol[1]}, column ${lineCol[2]}: ${message}`
  if (position) {
    const before = text.slice(0, Number(position[1]))
    const line = before.split('\n').length
    const column = before.length - before.lastIndexOf('\n')
    return `line ${line}, column ${column}: ${message}`
  }
  return message
}

// The server's entry in the project's .mcp.json. The mod stays silent when the
// project doesn't configure the server, and says so when the file is broken.
async function projectServerEntry($: EngineInterface, cwd: string, server: string, pluginUrl: string): Promise<ProjectEntry> {
  let text: string
  try {
    text = await $.fs.read(`${cwd}/.mcp.json`)
  } catch {
    return { kind: 'absent' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { kind: 'unreadable', detail: describeJsonError(text, error) }
  }
  const servers = (parsed as { mcpServers?: Record<string, unknown> } | null)?.mcpServers ?? {}
  const raw = servers[server]
  const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined
  const aliases = Object.entries(servers)
    .filter(([name, value]) => name !== server && value && typeof value === 'object'
      && typeof (value as { url?: unknown }).url === 'string'
      && normaliseUrl((value as { url: string }).url) === normaliseUrl(pluginUrl))
    .map(([name]) => name)
  return entry || aliases.length > 0 ? { kind: 'found', entry, aliases } : { kind: 'absent' }
}

const PROBE_TIMEOUT_MS = 3_000

type Probe = 'up' | 'down' | 'slow'

// Any HTTP answer means the editor's MCP plugin is listening; a rejected
// fetch (connection refused) means it is not. $.http.fetch has no timeout or
// abort signal, so the probe races it against a sleep: an editor that is busy
// (cooking, compiling shaders) or hung answers 'slow' instead of hanging the check.
async function probeEndpoint($: EngineInterface, url: string): Promise<Probe> {
  const request = $.http
    .fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
    .then((): Probe => 'up', (): Probe => 'down')
  const timeout = $.clock.sleep(PROBE_TIMEOUT_MS).then((): Probe => 'slow')
  return Promise.race([request, timeout])
}

// This plugin also ships the server in its own .mcp.json, so a session can
// re-dial it as a plugin server. Plugin servers' tools carry a plugin prefix.
const PLUGIN_NAME = 'unreal-mcp'

// Which copies of the server this session has tools from: the project's
// (.mcp.json) and/or the plugin's own.
type ToolSources = { project: boolean; plugin: boolean }

// The .mcp.json servers the user has turned off (merged settings), which
// Claude Code doesn't load, so they neither hide the plugin's server nor
// connect alongside it.
async function disabledProjectServers($: EngineInterface): Promise<Set<string>> {
  try {
    const value = await $.settings.read({ key: 'disabledMcpjsonServers' })
    return new Set(Array.isArray(value) ? value.filter((n): n is string => typeof n === 'string') : [])
  } catch {
    return new Set()
  }
}

// A server name as it appears in tool names: characters other than letters,
// digits, '_' and '-' become '_'.
function toolSegment(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_')
}

// projectNames: the configured name plus any other .mcp.json names at the
// plugin server's URL, so a renamed entry still counts as the project's copy.
// "project" means any copy that isn't the plugin's, wherever it's configured.
async function sessionToolSources($: EngineInterface, server: string, projectNames: string[] = [server]): Promise<ToolSources> {
  try {
    const names = (await $.tool.list()).map(t => t.name)
    const projectPrefixes = projectNames.map(n => `mcp__${toolSegment(n)}__`)
    return {
      project: names.some(n => projectPrefixes.some(p => n.startsWith(p))),
      plugin: names.some(n => n.startsWith(`mcp__plugin_${PLUGIN_NAME}_${toolSegment(server)}__`)),
    }
  } catch {
    return { project: false, plugin: false }
  }
}

function normaliseUrl(url: string): string {
  return url.trim().toLowerCase().replace('://localhost', '://127.0.0.1').replace(/\/+$/, '')
}

// Toasts are kept short: the cause and the fix.
const shadowToast = (name: string) =>
  `.mcp.json lists ${name}, which blocks reconnection. Remove it and start a new session.`

const twiceToast = (names: string[]) =>
  `connected twice, so every tool is listed twice. Remove ${names.join(' and ')} from .mcp.json or with claude mcp remove, then start a new session.`

// Claude Code often reconnects the server by itself once the editor answers;
// the mod can't re-dial it ($.mcp.connect returns the startup failure, tested).
// So the toast only shows once the editor has been up without a connection for
// a while, and points to the desktop app's Reconnect button ("Unreal MCP").
const RECONNECT_TOAST = "the editor is up but this chat hasn't connected. Press Reconnect on Unreal MCP under Connectors."

const URL_UNSET_TOAST = 'the Unreal Editor MCP URL setting is empty, so the plugin can\'t connect. Set it with /plugin configure unreal-mcp@drs-claude-tools.'

// detail is "line L, column C: message" when the parser gave a position, else
// the bare message; the toast keeps only the position.
function invalidJsonToast(detail: string): string {
  const position = /^line \d+, column \d+/.exec(detail)
  return position
    ? `.mcp.json isn't valid JSON (${position[0]}). Fix the file.`
    : ".mcp.json isn't valid JSON. Fix the file."
}

// An Unreal project folder: the plugin's own server is used there even when
// the project's .mcp.json doesn't list one.
async function isUnrealProject($: EngineInterface, cwd: string): Promise<boolean> {
  try {
    return (await $.fs.list(cwd)).some(f => f.name.toLowerCase().endsWith('.uproject'))
  } catch {
    return false
  }
}

// Per-session state, so sessions sharing this module don't hide each other's updates.
type SessionState = {
  last: string | undefined
  upAtStart: boolean | undefined   // endpoint state on the first check of this session
  connected: boolean
  everConnected: boolean           // connected at some point in this session
  waitingChecks: number            // checks in a row with the editor up and no tools
  tick: number
  inFlight: boolean
  shadowed: boolean                // the project's entry hides the plugin's server
  projectNames: string[]           // .mcp.json names of the project's copies of the server
  toasted: Set<string>             // states whose toast has shown since the state was entered
  checked: boolean                 // the first check has finished
}

// Each session's state by session id, so /unreal-mcp can report the session it runs in.
const sessions = new Map<string, SessionState>()

// The installed version, read from this plugin's own plugin.json so it always
// matches what is loaded. Undefined until read, or if it can't be read.
let version: string | undefined

async function loadVersion($: EngineInterface): Promise<string | undefined> {
  if (version !== undefined) return version
  try {
    const manifest = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)) as {
      version?: unknown
    }
    if (typeof manifest.version === 'string') version = manifest.version
  } catch {
    // Leave it unknown: the report works the same without it.
  }
  return version
}

// /unreal-mcp's reply: the version, this session's status as the status line
// shows it, and the URL being checked.
async function report($: EngineInterface, settings: Settings): Promise<string> {
  const v = await loadVersion($)
  let state: SessionState | undefined
  try {
    state = sessions.get(await $.session.id())
  } catch {
    state = undefined
  }
  const status = !state || !state.checked
    ? 'checking…'
    : state.last ?? 'inactive (not an Unreal project)'
  const url = settings.urlUnset ? '(URL not set)' : settings.endpoint
  return [v ? `unreal-mcp v${v}` : 'unreal-mcp', status, url].join(' · ')
}

// Shows a state's detail as a toast once each time the state is entered:
// `active` false clears it, so the toast shows again if the state returns.
function toastOnEntry($: EngineInterface, state: SessionState, key: string, active: boolean, text: string): void {
  if (!active) {
    state.toasted.delete(key)
    return
  }
  if (state.toasted.has(key)) return
  state.toasted.add(key)
  $.ui.toast(`Unreal MCP: ${text}`, { timeoutMs: 12_000 })
}

function show($: EngineInterface, state: SessionState, text: string | undefined): void {
  if (text !== state.last) {
    state.last = text
    $.ui.status(text)
  }
}

function describe(probe: Probe, tools: boolean, upAtStart: boolean | undefined, shadowed: boolean, twice: boolean,
  stillWaiting: boolean): string {
  if (twice) return '⚠ connected twice ⓘ'
  if (probe === 'slow') {
    return tools
      ? '◐ connected · editor busy'
      : '○ editor busy'
  }
  const up = probe === 'up'
  if (up && tools) return '● connected'
  if (up) {
    // Shadowed by a project entry, or not connected after waiting: either way
    // the toast says what to do. Until then Claude Code may still connect it.
    // upAtStart is kept in case "started after the session" needs telling apart again.
    void upAtStart
    if (!shadowed && stillWaiting) return '◐ editor up · connecting…'
    return '◐ editor up · not connected ⓘ'
  }
  // Refused: nothing is listening, almost always because the editor was closed.
  // That's normal, so it reads as offline whether or not the session was
  // connected; the session reconnects by itself when the editor comes back.
  return '○ offline'
}

async function refresh($: EngineInterface, cwd: string, settings: Settings, state: SessionState): Promise<void> {
  const project = await projectServerEntry($, cwd, SERVER_NAME, settings.endpoint)
  toastOnEntry($, state, 'invalid', project.kind === 'unreadable',
    project.kind === 'unreadable' ? invalidJsonToast(project.detail) : '')
  if (project.kind === 'unreadable') {
    state.connected = false
    return show($, state, '○ invalid .mcp.json ⓘ')
  }
  // Stay silent outside Unreal projects: no project entry and no .uproject.
  if (project.kind === 'absent' && !(await isUnrealProject($, cwd))) {
    state.connected = false
    return show($, state, undefined)
  }
  toastOnEntry($, state, 'urlUnset', settings.urlUnset, URL_UNSET_TOAST)
  if (settings.urlUnset) {
    state.connected = false
    return show($, state, '○ URL not set ⓘ')
  }

  // Entries the user turned off with disabledMcpjsonServers aren't loaded, so they don't count.
  const disabled = await disabledProjectServers($)
  const listed = project.kind === 'found' ? project.entry : undefined
  const entry = listed && !disabled.has(SERVER_NAME) ? listed : undefined
  // Project copies of the server: its name (if listed and enabled) and any
  // other enabled name at the plugin server's URL.
  const aliases = project.kind === 'found' ? project.aliases.filter(n => !disabled.has(n)) : []
  state.projectNames = [...(entry ? [SERVER_NAME] : []), ...aliases]
  // A server under the plugin server's name can also come from `claude mcp add`
  // (local or user scope), which .mcp.json doesn't show, so its tools always count
  // as another copy.
  const otherNames = state.projectNames.includes(SERVER_NAME) ? state.projectNames : [SERVER_NAME, ...state.projectNames]
  const [probe, sources] = await Promise.all([
    probeEndpoint($, settings.endpoint),
    sessionToolSources($, SERVER_NAME, otherNames),
  ])
  const tools = sources.project || sources.plugin
  const twice = sources.project && sources.plugin
  // Claude Code drops a plugin server when the project lists one of the same
  // name (checked with `claude mcp list`), so a project entry under the plugin
  // server's name hides it. A renamed entry doesn't hide it; both connect, and
  // that shows as connected twice.
  state.shadowed = entry !== undefined
  // A slow answer says the editor process exists, so it counts as up for the start check.
  if (state.upAtStart === undefined) state.upAtStart = probe !== 'down'

  toastOnEntry($, state, 'twice', twice, twiceToast(state.projectNames.length > 0 ? state.projectNames : [SERVER_NAME]))
  toastOnEntry($, state, 'shadowed', probe === 'up' && !tools && state.shadowed, shadowToast(SERVER_NAME))

  // Editor up but this session has no tools. Give Claude Code's own reconnect
  // time to finish before pointing to the Reconnect button.
  const waiting = probe === 'up' && !tools && !state.shadowed
  state.waitingChecks = waiting ? state.waitingChecks + 1 : 0
  const patience = state.everConnected ? RECONNECT_AFTER_CHECKS_IF_WAS_CONNECTED : RECONNECT_AFTER_CHECKS
  const stillWaiting = waiting && state.waitingChecks < patience
  toastOnEntry($, state, 'reconnect', waiting && !stillWaiting, RECONNECT_TOAST)

  state.connected = probe === 'up' && tools
  if (state.connected) state.everConnected = true
  show($, state, describe(probe, tools, state.upAtStart, state.shadowed, twice, stillWaiting))
}

// Skip a tick while the previous check is still pending, so a hung editor
// doesn't pile up requests that can't be cancelled.
async function guardedRefresh($: EngineInterface, cwd: string, settings: Settings, state: SessionState): Promise<void> {
  if (state.inFlight) return
  state.inFlight = true
  try {
    await refresh($, cwd, settings, state)
  } finally {
    state.checked = true
    state.inFlight = false
  }
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // A refused registration mustn't stop the status line.
    await $.command.register({
      name: 'unreal-mcp',
      description: 'Show the unreal-mcp version, connection status and URL',
    }).catch(() => undefined)
    const state: SessionState = {
      last: undefined, upAtStart: undefined, connected: false, everConnected: false, waitingChecks: 0,
      tick: 0, inFlight: false,
      shadowed: false, projectNames: [], toasted: new Set<string>(), checked: false,
    }
    try {
      sessions.set(await $.session.id(), state)
    } catch {
      // Without an id, /unreal-mcp reports "checking…" for this session.
    }
    void guardedRefresh($, e.cwd, settings, state)
    $.clock.every(POLL_MS, () => {
      state.tick++
      // Poll every 15 s until connected, then every 30 s.
      if (state.connected && state.tick % CONNECTED_EVERY_N_TICKS !== 0) return
      void guardedRefresh($, e.cwd, settings, state)
    })
    return result
  })

  on('session.end', async ($, e, next) => {
    sessions.delete(e.sessionId)
    return next(e)
  })

  on('command.run', { command: 'unreal-mcp' }, async $ => ({ text: await report($, settings) }))
}
