---
name: yestion
description: Yestion workspace conventions (READ FIRST) — page/folder layout, front matter, [[Page]] links, $math$, image paths, and the app's line-break convention. Load this before creating or editing any page.
---

# Yestion workspace — how to work here

## What this place is
A Yestion workspace: a plain folder of markdown files, opened in the **Yestion** app.
Everything you write is a real file the user can also open in Finder or an editor.
The user is usually watching the app while you work — your edits appear in the open
page by themselves within about a second (the app watches the folder). Never tell
the user to reload, refresh or re-open anything.

## Layout
- **Every page is a FOLDER containing `index.md`.** Nested folders are its subpages.
- Loose `*.md` files are also pages — leaf pages that cannot have children.
- Front matter is mandatory and must always be preserved:
  ```
  ---
  title: Page Title
  icon: 📄
  ---
  ```
  `title:` is the page's name in the app's sidebar. `icon:` is a single emoji and is
  optional. **Never repeat the title as a heading in the body.**
- PDFs, images and other attachments live in the folder of the page they belong to.
- Dotfolders (`.pi/`, `.yestion/`) are app/config internals — never treat them as pages.

## Markdown conventions (this app is picky)
- **Math**: inline `$…$`, display `$$…$$` (KaTeX). Both render live. Don't add extra escapes.
- **Page links**: `[[Exact Page Title]]` — the app turns them into clickable chips.
  A folder name works too. Prefer these over file paths when pointing at another page.
- **Images**: reference the file by **absolute path**.
  If the path contains spaces, wrap the destination in angle brackets:
  `![](</Users/hacker/Pictures/diagram 1.png>)`.
- **Line breaks**: a single newline *is* a real line break in this workspace. When the
  app saves, it writes those as a trailing backslash (`\`) at the end of the line, and a
  blank line as `\` on a line of its own. That is the normal on-disk form — keep it,
  don't "fix" it into blank lines, and don't collapse runs of them (the user uses them
  as answer space on worksheets).
- Also supported as-is: `- [ ]` task lists, pipe tables, blockquotes, fenced code with a
  language tag, inline `<svg>` diagrams (keep them self-contained, no external refs).
- **Keep the user's existing style.** Don't reflow, re-wrap or reformat paragraphs you
  were not asked to change, don't add headings or emoji they didn't have, and don't
  "tidy" their spacing.

## How to do the common jobs
- **Create a page**: make the folder and write `index.md` with front matter —
  e.g. for a subpage of the page currently open, create it *inside that page's folder*.
  `mkdir -p "<parent>/<New Title>"` then write `<parent>/<New Title>/index.md`.
- **Rename a page**: change `title:` in its `index.md`. Leave the folder name alone
  unless the user asks for the file path to change too, and update any `[[…]]` links
  that used the old title.
- **Move or delete**: plain `mv` / `rm` is fine — say what you moved or removed, and ask
  before deleting anything with real content in it.
- **Diagrams**: inline `<svg>` is rendered as a real diagram in the page.
- **Answering**: concise, structured, and cite the file paths you touched.

## Boundaries
- You may **read** anywhere on the machine. Only write outside the workspace root when the
  user explicitly asks.
- When the user says "this page", "here", "my notes", they mean the page the app says it is
  viewing — the message starts with a `[User is viewing the page "…" (path) …]` line.
  **That is the file in front of them: read it before editing, and edit that one.**
- Don't run destructive git or filesystem operations, and don't commit unless asked.
