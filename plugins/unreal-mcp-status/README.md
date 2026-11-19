# unreal-mcp-status

Connects Claude Code to the Unreal Editor's MCP server, and shows under the prompt whether the connection is working.

## Prerequisites

Your Unreal project needs the editor's MCP server running. Tested with Unreal Engine 5.8, where these plugins are experimental.

1. **Enable the plugins.** In the editor, open **Edit > Plugins** and enable:
   - **Unreal MCP** (`ModelContextProtocol`): required. This is the MCP server itself.
   - **All Toolsets** (`AllToolsets`): recommended. It gives Claude the editor's tools (actors, assets, Blueprints and so on); without it there is little to use.

   Restart the editor when asked.
2. **Start the server automatically.** Open **Edit > Editor Preferences > General > Model Context Protocol** and tick **Auto Start Server**. This is a personal setting, saved per project on your machine, so everyone using the project sets it once. Alternatively, run `ModelContextProtocol.StartServer` in the editor's console each time you open the editor.
3. **Leave the port at 8000**, set on the same page as **Server Port Number**, unless you need another. If you change it, change the plugin's port to match (see [Changing the port](#changing-the-port)).

Don't run the editor's `ModelContextProtocol.GenerateClientConfig ClaudeCode` command: it writes an `unreal-mcp` entry into the project's `.mcp.json`, which this plugin doesn't need (see the note under Install).

## Install

Install it in **one** of these two ways.

- **In a terminal session**, type this at the prompt:

  ```
  /plugin install unreal-mcp-status --marketplace DrStevenWright/claude-mods
  ```

- **In the desktop app**, click + next to the prompt box, then Plugins, then Add marketplace with `DrStevenWright/claude-mods`, then Add plugin.

When asked where to install it, choose **project** to turn it on for this Unreal project only, or **user** for all your projects. It stays hidden in folders that aren't Unreal projects.

**Important:** the plugin brings its own connection to the editor, called **Unreal MCP**. Don't also add an `unreal-mcp` server to your project's `.mcp.json`, under that name or any other. If one is there, remove it, or the connection won't work properly and every editor tool appears twice.

## Using it

Start the Unreal Editor, then start Claude Code in the project folder. The status line under the prompt should read `unreal-mcp-status ● connected`.

If you start Claude Code first, that's fine: once the editor is up, Claude Code usually connects by itself. If it hasn't connected within a minute or so, the status line asks you to reconnect: press **Reconnect** on **Unreal MCP** under Connectors (in the terminal, use `/mcp`).

| Status line (after `unreal-mcp-status`) | What to do |
| --- | --- |
| `● connected` | Nothing: it's working. |
| `◐ editor up · connecting…` | Wait: Claude Code is connecting. |
| `◐ editor up · not connected ⓘ` | Press **Reconnect** on **Unreal MCP**. If the message mentions `.mcp.json`, remove the project's `unreal-mcp` entry and start a new session. |
| `○ offline` | Start the editor. |
| `○ URL not set ⓘ` | Set the **Unreal Editor MCP URL** (see [Changing the port](#changing-the-port)), then start a new session. |
| `◐ connected · editor busy` or `○ editor busy` | Wait: the editor is compiling, cooking or showing a dialog. |
| `⚠ connected twice ⓘ` | Remove the `unreal-mcp` entry from the project's `.mcp.json`. |
| `○ invalid .mcp.json ⓘ` | Fix the project's `.mcp.json`. The message gives the line and column. |

`ⓘ` means a short message pops up to explain. The status line updates every 15 to 30 seconds, and stays empty in folders that aren't Unreal projects.

If **Unreal MCP** isn't listed under Connectors, start a new chat in the project folder: a chat started before the plugin was installed or updated doesn't have it.

## Changing the port

The plugin expects the editor's MCP server at `http://127.0.0.1:8000/mcp`. If your editor uses a different port, change the **Unreal Editor MCP URL** setting (`endpoint_url`) with `/plugin configure unreal-mcp-status@claude-mods` in a terminal session, or from PowerShell:

```
'{"endpoint_url":"http://127.0.0.1:8001/mcp"}' | claude plugin configure unreal-mcp-status@claude-mods --values-stdin
```

Then start a new session, or press **Reconnect** on **Unreal MCP**.

## Checking the connection

Run this in the project folder:

```
claude mcp list
```

Look for the `plugin:unreal-mcp-status:unreal-mcp` line: `✔ Connected` means it's working, and `✘ Failed to connect` means the editor isn't running.
