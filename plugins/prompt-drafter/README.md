# prompt-drafter

Side pane for drafting and formatting prompts before sending them to the prompt box, so you don't have to write long prompts in a separate editor and paste them in. Type `/draft` to open it beside the chat.

> **Experimental.** This mod is built on Claude Code's mod API, which is marked early access and may change between releases without notice. An update to Claude Code may break the pane until the mod is updated.

## What it does

- **A tall, multi-line editor.** Shift+Enter starts a new line. Enter never sends anything: it only saves the draft, so a long prompt can't be sent by accident.
- **Write, Preview and Split tabs.**
  - **Write** (the default): the editor sized to fill the pane, so the pane itself doesn't scroll and the mouse wheel only scrolls your draft.
  - **Preview**: the draft rendered as Markdown.
  - **Split**: the editor with a live preview underneath, updating shortly after you stop typing.

  The tab you pick is remembered, and switching tabs keeps your text.
- **Toolbar buttons** that add Markdown for you: • Bullet, 1. List, { } Code block (C++ by default), # Heading and ❝ Quote.
  - The list button continues the numbering of the list above it (`3.` after `2.`), keeping its indentation.
  - Any other button pressed after a quoted line adds a blank line first, so the new element isn't swallowed by the quote.
- **Send to prompt box** puts the draft in the normal message box, replacing what's there, and clears the pane. You still review it and press Enter yourself. **Copy** puts the draft on the clipboard. **Clear** empties the draft.
- **Autosave.** The draft is saved as you type and restored in later sessions.

## Known limitations

These come from what the mod API offers today, not from choices in the mod:

- **It is not a WYSIWYG editor.** You type Markdown (`- `, `1. `, ```` ``` ````) into a plain-text field and see it rendered in the Preview or Split tab. Mods can't draw a rich-text field.
- **Toolbar buttons only add at the end of the draft.** A mod isn't told where the cursor is or what text is selected, so a button can't insert at the cursor or wrap a selection (for example, quote the selected lines).
- **Lists don't continue automatically.** Shift+Enter after a list item gives a plain new line; type the next `- ` yourself or press the button. Continuing lists while typing was tried and removed: rewriting the text while you type made the cursor jump and missed some keystrokes.
- **Quotes need a blank line to end.** That's Markdown's rule: text typed straight after a `> ` line belongs to the quote. Press Shift+Enter twice to end it.
- **The "Save" label beside the editor takes some width.** It's drawn by Claude Code to show what Enter does, and a mod can only change its wording, not move or hide it.
- **Split mode can make the pane scroll.** With a long draft the preview makes the pane taller than its window, so the mouse wheel may scroll the pane instead of the editor. Use the Write tab for long drafts.
- **No mobile support.** The Claude mobile app doesn't draw text fields in panes yet, so the pane shows a notice there. It works in the desktop app and in a terminal.
- **One draft at a time.** There's a single saved draft, shared by all sessions: two sessions drafting at once overwrite each other's saved copy.
- **Copy may not work in the desktop app.** The mod API documents clipboard writes for the terminal only, so the button shows "Could not copy the draft" if the app refuses. **Send to prompt box** works everywhere.

## Install

```
/plugin install prompt-drafter --marketplace DrStevenWright/DrsClaudeTools
```

Choose the **user** scope to have `/draft` in every session.

## Development

The tests run with:

```
claude plugin test plugins/prompt-drafter
```
