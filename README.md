# claude-mods

Claude Code mods (plugins) by DrStevenWright, published as a plugin marketplace.

| Mod | What it does |
| --- | --- |
| [unreal-mcp-status](plugins/unreal-mcp-status) | Connects Claude Code to the Unreal Editor's MCP server and shows whether the connection is working |
| [prompt-drafter](plugins/prompt-drafter) | Side pane for drafting and formatting prompts before sending them to the prompt box (experimental) |
| [git](plugins/git) | Slash commands that stage, commit, publish and tidy up git branches, following each repo's own workflow rules |

## Installing a mod

At the prompt of a terminal Claude Code session:

```
/plugin install <mod> --marketplace DrStevenWright/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install <mod> --marketplace DrStevenWright/claude-mods
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `DrStevenWright/claude-mods`, then Add plugin.
