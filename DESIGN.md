# Yestion — visual language

The reference for how this app should look. Written before the rework described
at the bottom, so it states the direction rather than describing the code.

## The brief

Yestion is a local, files-first notebook for one person's school year — math with
LaTeX, PDFs of past papers, images, tables, CJK next to Latin — with a coding
agent living in a side panel. It is open all day, next to a browser.

The complaint that started this: *"it still feels like a 5 year old Android
phone, not a brand new iPhone."* That is not a request for decoration. It is a
request for the things Apple is good at: one material system, real typographic
hierarchy, and chrome that stays out of the way of the content.

## The idea: paper and glass

Every surface is one of two things, and the rule is the same everywhere:

- **Paper** — holds your notes. Opaque, full-bleed, no border, no shadow, no
  radius. The document is not a widget.
- **Glass** — acts on your notes. Translucent, blurred, thin, quiet. Navigation,
  tabs, toolbars, panels, popovers, menus.

A reader should be able to tell, without thinking, which parts are theirs and
which parts are the app's. Today the app has four floating cards and a flat
toolbar band, all with the same radius and the same shadow — so nothing means
anything.

### What this replaces

| Today | Why it reads as dated |
| --- | --- |
| Four rounded cards (sidebar, toolbar, page) floating on a grey backdrop, every one with `--r-xl` and `--shadow-sm` | The SaaS-card kit: one radius and one shadow for every level of hierarchy |
| A chrome band split across a floating top strip and a separate toolbar card | Two systems doing one job |
| 12.5–13.5px for every label at every level | No type scale, so no hierarchy |
| Breadcrumb, font, size, export, preview, split and display in one undifferentiated row | Four kinds of control with one weight |
| Emoji as icons (🗂️ 📘 ✖ ⤢ ⎙ ⚙) | The strongest "toy" signal in the app |

## Colour

Kept: the 8 themes and the derivation in `themes.ts`. It is the app's best
existing system and it is not the problem — a theme swap should keep working.

Added: the paper is not the same white as the tools. `--paper` sits a hair above
`--panel-bg`, and glass never uses a flat fill.

```
--paper        #ffffff   the page itself       (light theme)
--glass        rgba(255,255,255,0.72)          the chrome over it
--glass-line   rgba(0,0,0,0.07)                where glass meets paper
--ink          #1c1c1b   text, one notch off black
--ink-2        #55544f   secondary
--ink-3        #8a8983   labels, metadata
--accent       #2b5fd9   one accent, nowhere else
```

## Type

One family: the platform system font, which already ships optical sizing and
per-size tracking. No display face — a "distinctive" serif here would be
decoration, not information.

Tracking is a function of size, never a single value: tighten as it grows,
leave body at 0, open up the smallest sizes.

| Role | Size | Weight | Tracking | Where |
| --- | --- | --- | --- | --- |
| large title | 32 | 700 | −0.022em | the page's own title |
| title | 22 | 640 | −0.017em | h1 in a document |
| heading | 17 | 620 | −0.012em | h2 |
| body | 15 | 400 | 0 | a document's prose, leading 1.65 |
| ui | 13 | 450 | 0 | sidebar rows, buttons, tabs |
| label | 12 | 500 | +0.005em | toolbar, breadcrumb, metadata |
| micro | 11 | 550 | +0.01em | counts, ⌘ hints |

Sentence case for every label. No uppercase eyebrows, no tracked-out all-caps,
no middle-dot meta strings.

## Layout

```
┌────────────┬──────────────────────────────────────────────┐
│            │  ◀ ▶   Notebook ⌄            Light  ▦ ▥ ▤   │  glass
│  glass     ├──────────────────────────────────────────────┤
│  sidebar   │  Tab  Tab  Tab  +      Note / Math / Q1      │  glass
│            │                        Helvetica 15  PDF ⬤   │
│            ├──────────────────────────────────────────────┤
│            │                                              │
│            │            paper — the document              │
│            │            (640px measure, centred)          │
│            │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- One chrome band above the paper, not a card. Tabs and document controls are
  two rows of it, separated by a hairline rather than by a gap and a shadow.
- The document is full-bleed: the page scrolls under the chrome, which is
  translucent, so the top edge of the content is never a hard cut.
- The sidebar is glass and runs the full height. No margin, no radius.
- Row heights come from one scale: 24 / 28 / 32, not from padding picked per
  component.

## Motion

Kept from the existing system, which is already right: `--dur-fast` 140ms,
`--dur` 240ms, `--dur-slow` 380ms, `--ease` `cubic-bezier(.16,1,.3,1)`,
asymmetric exit, `@starting-style` entrances, press feedback, `prefers-reduced-motion`.

Added: nothing that animates on a keyboard-initiated action. Switching tabs with
⌘1–9 happens hundreds of times a day and must be instant.

## The self-check

What would a generic model produce for "make a notes app feel like a new iPhone"?
A warm cream background, a serif display face, a tracked all-caps eyebrow above
each section, identical rounded cards with one shadow, and a fade-and-slide
entrance on everything. This direction does the opposite: it removes cards,
removes colour, removes uppercase, and spends the whole budget on the type scale
and on one material rule.

## Rework log

- **Slice 1 — paper and glass.** Chrome becomes one translucent band; the page
  and sidebar stop being cards; the type scale above; the toolbar row regrouped.
  - `--paper`, `--glass` and `--glass-line` are derived per theme in
    `themes.ts` (`deriveTokens`), so all eight themes get the rule for free.
  - The command row no longer floats in the centre of the window: workspace and
    theme sit at the left with the nav buttons, the view toggles alone at the
    right, and the workspace menu hangs off the switcher.
  - The document controls (font, size, PDF, preview, split, display) are one
    cluster behind a hairline, all at `--t-label`, so "where am I" and "what can
    I do" stop being the same line of grey text.
  - **No `backdrop-filter` on the shell.** It makes an element a stacking
    context, which trapped the z-index of the popovers hanging out of the band
    (`#ws-menu`, export, display) and let the page paint over them. It was also
    invisible — the band sits on a flat backdrop. It returns when the page
    scrolls under the chrome, on a wrapper with no popovers in it.
  - **Outline trimmed.** Two heading levels, collapsed by default, capped at
    34vh. A twelve-row `Act * Scene *` list was taking the sidebar.

### Next

- Frameless title bar (`titleBarStyle: 'hiddenInset'`): the band becomes the
  window's top edge, so there aren't two bars stacked at the top of the window.
  Needs the traffic-light inset in the sidebar and `-webkit-app-region` on the
  band with `no-drag` on every control in it.
- Content scrolling under the chrome, which is when the blur comes back.

