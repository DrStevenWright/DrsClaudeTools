# prompt-drafter

A side pane for drafting and formatting prompts before sending them to the prompt box, so you don't have to write long prompts in a separate editor and paste them in. This avoids the risk and the token cost of accidentally submitting your prompt before it is ready by mistyping or, as I frequently do, forget that Enter submits the prompt rather than adds a line return.]

![The prompt drafter in Split mode: tabs and formatting buttons at the top, the Markdown draft in the editor, and the rendered preview below](images/drafter-split.png)

> **Experimental.** This mod is built on Claude Code's mod API, which is marked early access and may change between releases without notice. An update to Claude Code may break the pane until the mod is updated.

## Install

In a terminal Claude Code session:

```
/plugin install prompt-drafter --marketplace DrStevenWright/DrsClaudeTools
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `DrStevenWright/DrsClaudeTools`, then **Add plugin**.

Choose the **user** scope to have the drafter in every session.

## Using it

1. **Open the pane.** Type `/draft`, or in the desktop app right-click anywhere in the conversation and choose **Open prompt drafter**. (That menu item only appears while the pane isn't on screen: closed, hidden, or behind another pane's tab.)
2. **Write your prompt** in the editor. **Shift+Enter** starts a new line. **Enter** never sends anything: it only saves the draft, so a half-written prompt can't go off by accident.
3. **Format it** with Markdown, either by typing it (`- `, `1. `, `## `, `> `, ```` ``` ````) or with the toolbar buttons, which add it to the end of the draft for you.
4. **Check it** on the **Preview** tab, or use **Split** to see the preview update under the editor as you type.
5. **Send it.** **Send to prompt box** moves the draft into the normal message box and clears the pane. Review it there and press Enter to send it to Claude.

Your draft is saved as you type and comes back in later sessions, so you can close the pane and return to it. **✕ Close**, next to the tabs, closes the pane; the app's own hide button only hides it. The dim line at the bottom of the pane shows the installed version, and so does `/draft`'s reply.

## The pane at a glance

**Tabs**

| Tab | Shows |
| --- | --- |
| **Write** (default) | The editor alone, sized to fill the pane, so the mouse wheel only scrolls your draft. Best for long prompts. |
| **Preview** | The draft rendered as Markdown, exactly as Claude will read it. |
| **Split** | The editor with a live preview underneath, as in the picture above. The preview catches up shortly after you stop typing. |

The tab you pick is remembered, and switching tabs keeps your text. **✕ Close**, at the end of the tab row, saves the draft and closes the pane.

**Toolbar**

| Button | Adds |
| --- | --- |
| **• Bullet** | A bullet point: `- ` |
| **1. List** | The next numbered item: `1. `, or `3. ` after a `2. ` line, keeping its indentation |
| **{ } Code block** | A fenced code block, labelled `cpp`. Change the label to `text`, `log` or another language as needed. |
| **# Heading** | A heading: `## ` |
| **❝ Quote** | A quoted line: `> `. Press again for another quoted line. |

Buttons pressed after a quoted line start with a blank line, so the new element isn't swallowed by the quote.

**Bottom row**

| Button | Does |
| --- | --- |
| **Send to prompt box** | Replaces whatever is in the message box with the draft, then clears the pane. Nothing is sent until you press Enter. |
| **Copy** | Puts the draft on the clipboard. |
| **Clear** | Empties the draft. |

**Tips**

- **Ending a quote:** Markdown keeps a quote going until a blank line, so press **Shift+Enter twice** before carrying on with normal text.
- **Pasting logs or compiler errors:** use a code block rather than a quote. Text in a code block is kept exactly as pasted, while `*`, `_` and `#` inside a quote are read as formatting.

## Known Issues/limitations

These come from what the mod API offers today, not from choices in the mod:

- **It is not a WYSIWYG editor.** You type Markdown into a plain-text field and see it rendered in the Preview or Split tab. Mods can't draw a rich-text field.
- **Toolbar buttons only add at the end of the draft.** A mod isn't told where the cursor is or what text is selected, so a button can't insert at the cursor or wrap a selection (for example, quote the selected lines).
- **Lists don't continue automatically.** Shift+Enter after a list item gives a plain new line; type the next `- ` yourself or press the button. Continuing lists while typing was tried and removed: rewriting the text while you type made the cursor jump and missed some keystrokes.
- **The Save button beside the editor takes some width.** It's drawn by Claude Code to show what Enter does, and a mod can only change its wording, not move or hide it.
- **Split mode can make the pane scroll.** With a long draft the preview makes the pane taller than its window, so the mouse wheel may scroll the pane instead of the editor. Use the Write tab for long drafts.
- **The right-click menu item is desktop-only.** Elsewhere, use `/draft`.
- **No mobile support.** The Claude mobile app doesn't draw text fields in panes yet, so the pane shows a notice there. It works in the desktop app and in a terminal.
- **One draft at a time.** There's a single saved draft, shared by all sessions: two sessions drafting at once overwrite each other's saved copy.
- **Copy may not work in the desktop app.** The mod API documents clipboard writes for the terminal only, so the button shows "Could not copy the draft" if the app refuses. **Send to prompt box** works everywhere.

## Development

The tests run with:

```
claude plugin test plugins/prompt-drafter
```

The right-click menu test needs a Claude Code recent enough to know the right-click menu: 2.1.326 works, 2.1.321 doesn't.
