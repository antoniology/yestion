# Yestion

**A local-first Markdown notebook, LaTeX typesetter, and exam runner I built to make school easier.**

![Platform](https://img.shields.io/badge/platform-macOS%2012%2B-black?logo=apple)![License](https://img.shields.io/badge/license-MIT-blue.svg)![Made for students](https://img.shields.io/badge/made%20for-students-6f42c1)Yestion is a folder of plain `.md` files, a fast distraction-free editor, and an in-process AI agent—offline, account-free, and subscription-free.

---

## Why Yestion?

### Plain files, real folders

- **One folder per school year** — every subject is a directory, every note is a `.md` file. The sidebar reflects your folder tree with no import step.
- **Live sync with external editors** — Yestion watches your folder, so edits made by another editor or the built-in agent appear immediately.
- **Fast navigation** — `[[Page Title]]` wiki-links, full-workspace search, and a collapsible page outline.
- **Private by design** — no accounts, no telemetry, no cloud sync. Workspaces can optionally be encrypted at rest.

### Built for math, physics & worksheets

- **LaTeX typesetting** — `$inline$` and `$$display$$` equations render with KaTeX, paired with bundled with a variety of sans, serif and monospace fonts for a diverse reading view.
- **Flexible tables & diagrams** — supports Markdown, borderless, and LaTeX (`booktabs`) table styles, inline SVG diagrams, `<h>highlights</h>`, and preserved blank lines for printable worksheets.
- **PDF export** — export notes or papers to PDF with your chosen font embedded.
- **8 themes** — light and dark themes.

### Interactive `.qz` exam & flashcard runner

Any quiz, past paper, or flashcard deck lives in a single plain-text `.qz` file. Open it in Yestion to launch a full exam environment:

- **Question types** — multiple choice, true/false, fill-in-the-blank, numeric, matching, ordering, and short/long prose answers.
- **Flexible layouts & timing** — `page = sep` for one question per screen or `cont` for a scrolling paper, with a persistent timer that survives tab switches.
- **Autosave & resume** — answers, flags, marks, and remaining time are saved continuously so you can close the app mid-paper and pick back up later.
- **Marking & contest scoring** — automatic grading for objective questions, model-based grading for prose, and custom scoring rules for contests (e.g. AMC: `+6` correct, `0` wrong, `+1.5` blank).

### In-process AI agent (BYOK)

The side-panel agent runs [pi](https://github.com/badlogic/pi-mono) directly inside the app with read, write, and search access to your workspace.

- **Built for study workflows** — summarize a chapter, turn a past paper into revision notes, or generate a `.qz` practice quiz from your notes.
- **Bring your own key** — works with Anthropic, OpenAI-compatible endpoints, Google, or local Ollama models.
- **Safe & resilient** — API keys are stored in the **macOS Keychain** (never in your notes or repo), conversations are resumable, and failed streams retry automatically.

---

## Yestion vs. Notion

If you want a team wiki with databases and permissions, use Notion. If you want school notes you can still open in any text editor ten years from now, use Yestion.

|  | **Yestion** | **Notion** |
| --- | --- | --- |
| **Storage** | Plain `.md` files in a folder you choose | Notion's cloud workspace |
| **Account** | None | Required |
| **Offline** | Full local-first support | Limited / sync-dependent |
| **Pricing** | Free, MIT | Free tier; paid plans & AI add-ons |
| **AI** | Workspace agent using your own API key. You can also let your coding agent read all your notes: it's just markdown. | Cloud-only Notion AI subscription |
| **Portability** | Copy the folder | Export and convert |
| **Exams & revision** | Native `.qz` exam, quiz & flashcard runner | Not built in |
| **Math & tables** | KaTeX, Computer Modern, `booktabs` tables, PDF export | Basic equations & block tables |

---

## Getting started

### Requirements

- **macOS 12+** (Apple Silicon for packaged builds)
- **Node.js 20+**

### Run or build from source

```sh
git clone https://github.com/antoniology/yestion.git
cd yestion
npm install

# Run in development
npm run dev

# Or package a local macOS app / DMG
npm run package      # outputs dist/mac-arm64/Yestion.app
npm run dmg          # wraps the app in a DMG
```

> **Note:** Packaged builds are not notarized yet, so macOS will require a one-time **Open Anyway** approval in System Settings on first launch.

---

## Development

```sh
npm run typecheck    # typecheck both main and renderer TypeScript projects
npm run build        # build main and renderer bundles into out/
```

### Project layout

```text
src/main        Electron main process (workspace, file watcher, agent, PDF printing)
src/preload     contextBridge API (renderer compiles against index.d.ts)
src/renderer    UI, TipTap editor, .qz quiz runner, agent panel
resources       App icons and macOS entitlements
scripts         Packaging and DMG helpers
```

---

## Status & contributing

Yestion is an active, student-built daily driver. Expect the UI and `.qz` format to keep evolving; issues and pull requests are welcome.

## License

MIT — see [LICENSE](LICENSE).

Bundled fonts: **CMU Serif** is distributed under the SIL Open Font License; **KaTeX** ships its own fonts under their respective licenses.
