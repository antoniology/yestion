# Yestion

**A free, local-first notes app built around a student's school year.**
Your notes are plain markdown files in a folder you choose — with a built-in AI
agent, a real exam runner, and LaTeX-quality typesetting.

[![Platform](https://img.shields.io/badge/platform-macOS%2012%2B-black?logo=apple)](https://github.com/antoniology/yestion)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Made for students](https://img.shields.io/badge/made%20for-students-6f42c1)](#why-not-notion)

Yestion is not a workspace platform. It is a folder of markdown files, a good
editor, and an agent that can work on them — offline, without an account, and
without a subscription.

---

## Why not Notion?

Both can hold your notes. They disagree about who owns them.

| | **Yestion** | **Notion** |
| --- | --- | --- |
| **Where notes live** | Plain `.md` files in a folder you pick | Notion's cloud workspace |
| **Account required** | No | Yes |
| **Works offline** | Yes — it is a local app | Limited / needs sync |
| **Cost** | Free, MIT | Free tier; paid plans and AI add-ons |
| **AI** | A real agent with file access, using **your own** API key | Notion AI subscription, cloud-only |
| **Leaving** | Copy the folder | Export, then convert |
| **Exams & revision** | Built-in `.qz` exam, quiz and flashcard runner with marking | Not a native feature |
| **Maths & physics** | KaTeX everywhere, Computer Modern bundled, PDF export | Basic equations |
| **Tables** | Markdown, borderless, or LaTeX (booktabs) styles | Block-based tables |

If you want a team wiki with databases and permissions, use Notion. If you want
your school notes to be files you can read in ten years with any text editor,
Yestion is built for that.

---

## Made for students

The app assumes the things a school year actually involves:

- **One workspace per school year** — every subject is a folder, every page a
  markdown file. The sidebar is the folder tree; there is no separate "import".
- **Physics and maths** — `$inline$` and `$$display$$` equations render with
  KaTeX, and **Computer Modern** is bundled as a reading font for a paper-like
  page.
- **Revision, not just reading** — turn a topic into a quiz, take it under a
  timer, get it marked, and keep the attempt if you close the app.
- **Worksheets** — preserved blank lines, highlights (`<h>…</h>`), tables and
  inline SVG diagrams all survive a save/reload round trip.
- **Search and links** — `[[Page Title]]` links, full-workspace search, an
  outline of the page you are reading.
- **PDF** — export a page or a paper with the chosen font embedded.

### The exam runner

A quiz, exam or flashcard deck is a single `.qz` file. Open it and it runs:

- timed papers with a start screen and a clock that survives tab switches;
- multiple choice, true/false, fill-in-the-blanks, short and long answers,
  numeric, matching and ordering questions;
- automatic marking for objective questions, model-based marking for prose;
- rule-based scoring for contest papers (e.g. AMC: correct 6, wrong 0,
  blank 1.5);
- answers, flags, marks and the clock autosaved and restored;
- `page = sep` for one question per screen, or `cont` for a scrolling sheet.

The file is plain text with the answers inside it — your paper, your key.

## The agent

The agent panel runs [pi](https://github.com/badlogic/pi-mono) in-process. It can
read, write and search the workspace, so you can ask it to summarise a page,
draft revision notes from a past paper, or author a `.qz` file.

- Bring your own provider and API key (OpenAI-compatible, Anthropic, Google, or
  a local Ollama model).
- Keys are stored in the **macOS Keychain**.
- Conversations are resumable, and failed streams are retried instead of
  dropping the task.

## Privacy

- Notes never leave the folder you choose. There is no Yestion account and no
  Yestion server.
- The app watches the folder; edits made by the agent or another editor appear
  live.
- API keys are kept in the Keychain, not in your notes or in this repository.
- Workspaces can optionally be encrypted at rest.

## Requirements

- macOS 12 or later (Apple Silicon for the packaged build).
- Node.js 20+ to build from source.

## Build from source

```sh
git clone https://github.com/antoniology/yestion.git
cd yestion
npm install
npm run dev          # run the app in development
npm run typecheck    # both TypeScript projects
npm run build        # renderer + main bundles in out/
npm run package      # dist/mac-arm64/Yestion.app
npm run dmg          # wrap the packaged app in a DMG
```

There is no notarized download yet; a locally built app needs the usual macOS
"Open Anyway" approval on first launch.

## Project layout

```
src/main        Electron main process: workspace, watcher, agent, printing
src/preload     contextBridge API (the renderer compiles against index.d.ts)
src/renderer    UI, TipTap editor, quiz runner, agent panel
resources       icons and entitlements
scripts         packaging helpers
```

## Status

Yestion is an early, personal project. It is a working daily driver for one
student, not a polished commercial product. Issues and pull requests are
welcome; expect the shape of the app to keep moving.

## License

MIT — see [LICENSE](LICENSE).

Bundled fonts: CMU Serif is distributed under the SIL Open Font License; KaTeX
ships its own fonts under their respective licenses.
