# Parked Items

Park follow-up work from any Claude Code chat, and find it again later in one place.

You might put something off because you're blocked, busy with something else, or want to think about it more.
Parked Items doesn't care why. It keeps a single list of everything you've parked, across all your sessions and
projects, with the chat each item came from and any notes you added.

## Using it

- **`/park`** opens the park dialog in the pane, with Title, Notes and From boxes. From starts as the first words of
  the chat and can be changed, or cleared to leave it out. Anything you type after the command
  becomes the title: `/park Fix the flaky login test`. Press **Park** to save it. Nothing is saved until you do.
- **Right-click → Park item for later** (desktop app) on text you've selected in the chat, or on a message, opens the same
  dialog with that text already in the notes. You give it a title.
- **+ Park** in the pane opens the dialog empty.
- **Suggest**, in the dialog, asks Claude for titles. With a title or notes filled in, Claude works from those and the
  last few messages; with neither, it reads the conversation. Press a suggestion to use its title. Its notes go in too
  if the Notes box is empty or still holds an earlier suggestion's notes. Claude is only asked when you press Suggest.
- **Claude offers** to park follow-ups, if you turn that on (see Settings): when a chat decides to put some work off,
  Claude opens the dialog with a proposed title and notes. You edit it and press Park, or Cancel. Nothing is saved
  unless you press Park.
- **`/parked`** opens the Parked items pane.
- While anything is parked, a reminder line above the prompt shows something like **◷ 2 parked issues (3 total)**:
  the open items from the current project, then the open items across all projects. Click it to open the pane.
  It hides while the pane is open.

The Parked items pane lists your items grouped by project, with **Open** and **Closed** tabs. For each item you can:

- **Edit** its title, notes and From
- **Close** it when it's done (it moves to Closed, and can be reopened)
- **Delete** it for good, after a confirmation

## Settings

- **Claude offers to park follow-ups** (off by default). When on, Claude can open the park dialog itself. This adds a
  tool and a short instruction to each request Claude makes, about 300 tokens, mostly served from the prompt cache.
  Set it when you install the mod, or later in Claude Code's config menu (`/config`). A change applies from the next
  chat you start.

## Privacy

The list is stored on your own computer, by Claude Code, for this mod only. Nothing is sent anywhere, apart from the
request to Claude that suggests what to park, which uses your normal Claude session.

## Installation

In a terminal Claude Code session:

```
/plugin install parked-items --marketplace DrStevenWright/DrsClaudeTools
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `DrStevenWright/DrsClaudeTools`, then **Add plugin**.

Choose the **user** scope to have your parked items in every session.

## License

MIT
