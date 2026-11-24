# Yestion

A files-first, Notion-like markdown workspace with a built-in coding agent — an
Electron app for one person's school year.

Your notes are plain files in a folder you choose. Every page is a `.md` file or
a folder with an `index.md`; the app watches the folder, so edits made by the
agent or another editor appear in the page as they happen.

## What it does

- **Pages** — markdown with headings, math (KaTeX), tables, images, inline SVG,
  highlights, page links, task lists.
- **Agent panel** — pi runs in-process and can read, write and search the
  workspace. Runs resumable, session history, `/` commands.
- **Quiz papers** — a single `.qz` file is a runnable exam, quiz or flashcard
  deck: timed, auto-marked, AI-marked prose, rule-based contest scoring,
  attempt autosave and resume.
- **Export** — pages and papers to PDF, with the chosen reading font embedded.
- **Workspaces can be encrypted** — private notes are stored in an encrypted
  container and only opened while unlocked.

## Requirements

- macOS 12 or later (Apple Silicon for the packaged build).
- Node.js 20+ to develop.

## Development

```sh
npm install
npm run dev          # electron-vite dev server
npm run typecheck    # both TypeScript projects
npm run build        # renderer + main bundles into out/
```

Packaging uses `electron-builder`:

```sh
npm run package      # build + dist/mac-arm64/Yestion.app (no DMG)
npm run dmg          # wrap the packaged app in a DMG
```

`npm run dist:mac` builds a DMG directly; `dist:mac:x64` and
`dist:mac:universal` target other architectures.

## Layout

```
src/main        Electron main process: workspace, watcher, agent, printing
src/preload     contextBridge API (the renderer compiles against index.d.ts)
src/renderer    UI, TipTap editor, quiz runner, agent panel
resources       icons and entitlements
scripts         packaging helpers
```

## Where your data lives

- **Notes** stay in the workspace folder you pick. The app never copies them
  anywhere else.
- **App settings and agent sessions** live in the Electron `userData` folder.
- **API keys** are stored in the macOS Keychain via Electron `safeStorage`, not
  in the repository or in any workspace file.

## License

MIT (see `package.json`). Bundled fonts: CMU Serif is distributed under the SIL
Open Font License; KaTeX ships its own fonts under their respective licenses.
