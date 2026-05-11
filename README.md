# Müslidian

> Obsidian plugin that syncs meetings from [Granola](https://granola.ai) into
> your vault as markdown files, preserving your annotations across re-syncs.

One-way: Granola → Obsidian. Attendees auto-link to existing Person notes.
The plugin owns specific marker-delimited regions in each file; everything
else you write is preserved verbatim.

## Install

### Via BRAT (recommended)

1. Install the **BRAT** community plugin in Obsidian.
2. In BRAT settings → *Add Beta plugin*: `https://github.com/<you>/obsidian-granola-meetings`.
3. (Private repo only) Configure a GitHub personal access token in BRAT.
4. Enable **Müslidian** under Settings → Community Plugins.

### Manual install

```bash
git clone https://github.com/<you>/obsidian-granola-meetings.git
cd obsidian-granola-meetings
cp .env.example .env   # set OBSIDIAN_PLUGIN_TARGET to <vault>/.obsidian/plugins
make setup
make install
```

Then enable **Müslidian** in Obsidian's Community Plugins.

## Configure

Open **Settings → Müslidian** and fill in:

| Setting | Default | Notes |
|---|---|---|
| API key | (empty) | Granola → Settings → Connectors → API keys. Format: `grn_*`. |
| Sync directory | `Besprechungen` | Where synced notes live. |
| Person folder | `Personen` | Folder scanned for `Person - {First Last}.md`. Empty disables attendee linking. |
| Allowed Granola folders | (empty) | Whitelist by Granola folder name. Empty = sync everything. |
| Earliest creation date | (empty) | `YYYY-MM-DD` lower bound. Older notes are invisible. |
| Document sync limit | `0` | Cap on the N most recent notes. `0` = unlimited. |
| Periodic interval (min) | `0` | `0` disables. Range 0–1440. |
| Skip existing notes | off | Frozen-archive mode: never updates existing files. |
| Filename template | `{date} {title}` | Placeholders: `{date} {created_date} {updated_date} {title} {id}`. |
| Date format (filenames) | `DD.MM.YYYY` | Tokens: `YYYY`, `MM`, `DD`. |
| Include "My Notes" placeholder | on | Adds `## My Notes` between Enhanced Notes and Transcript on new files. |
| Include Enhanced Notes | on | AI summary block. |
| Include transcript | on | Speaker-tagged transcript callout. |
| My name | (empty) | Attendees matching this name are excluded from auto-tag generation. |
| Attendee tag template | `person/{name}` | `{name}` is the underscored full name. |
| Additional frontmatter | (empty) | YAML stamped onto new files only. Plugin-managed keys are skipped (warning). |

## Commands

- **Müslidian: Sync now** — pull all allowed Granola notes.
- **Müslidian: Sync meeting by ID or URL** — pulls one note (bypasses
  the allowlist). Uses the editor's current selection as the ID or URL
  input; `not_*` substring is extracted via regex — full URLs work.
- **Müslidian: Test connection** — verify the API key.

The settings panel exposes `[Sync now]` and `[Clear filtered-out cache]`
buttons. The status bar item shows live sync state and the last sync's
relative time; click it for the report modal (counts + clickable
unmatched-attendees list that creates Person notes via QuickAdd or a
stub fallback).

## CLI

A standalone CLI lives at `bin/mueslidian.ts` (built to `dist/mueslidian.js`).
Useful for testing the API without launching Obsidian.

```bash
export GRANOLA_API_KEY=grn_<key>
node dist/mueslidian.js test                     # → "OK (N notes)"
node dist/mueslidian.js list [--after DATE] [--json]
node dist/mueslidian.js get <not_id> [--transcript] [--json]
node dist/mueslidian.js dump <not_id>            # raw JSON
```

The `--json` mode emits NDJSON (one note per line), pipe-friendly to `jq`.

## File contract

Each synced meeting becomes one markdown file in your Sync directory.

```yaml
---
granola_id: not_xxxxxxxxxxxxxx
granola_updated_at: 2026-01-27T16:45:00Z
granola_synced_at: 2026-01-27T16:45:00Z
title: Quarterly review
date: 2026-01-27
attendees:
  - name: Alice
    email: alice@example.com
tags: [meeting, granola, person/Alice]
# ...plus user-added keys (preserved)
---
<!-- granola:meta:start -->
# Quarterly review
> [!info] Meeting
> **When:** 27.01.2026 16:00–16:45
> **Attendees:** [[Person - Alice|Alice]]
> **Granola:** [Open](https://granola.ai/...)
<!-- granola:meta:end -->

<!-- granola:enhanced:start -->
## Enhanced Notes
…AI summary…
<!-- granola:enhanced:end -->

## My Notes
(your free-form notes — preserved across syncs)

<!-- granola:transcript:start -->
## Transcript
> [!quote]- Transcript
> **Alice (00:00):** …
<!-- granola:transcript:end -->
```

**The plugin owns:**
- All `granola_*` frontmatter keys.
- API-derived keys (`title`, `date`, `attendees`, `invitees`, `web_url`, …).
- The `person/*` namespace within `tags`.
- Body content between `<!-- granola:* -->` marker pairs.

**You own:**
- Any other frontmatter key (including `notes_on_speakers`).
- Tags outside the `person/*` namespace.
- Body content outside marker blocks (including `## My Notes`).

Marker blocks can be reordered — the plugin finds them by name, not position.

## Security

The API key is stored in plain text at
`<vault>/.obsidian/plugins/mueslidian/data.json`.

- If your vault is in a Git repo, **gitignore that file**:
  ```
  .obsidian/plugins/mueslidian/data.json
  ```
- If your vault syncs to iCloud / Dropbox / Syncthing, the key syncs too.
  Decide whether that fits your threat model.
- The plugin never logs the API key. The CLI also never echoes it.

## Development

```bash
cp .env.example .env       # set OBSIDIAN_PLUGIN_TARGET
make setup                 # npm install
make doctor                # verify env

make watch                 # esbuild watch → dist/
make link                  # symlink vault → ./dist (live dev with Hot Reload)

make check                 # typecheck + lint + test
make install               # build + copy dist/ → vault (production-style)
```

See `make help` for the full target list.

## Limitations

- **Public API only** — your handwritten Granola notes aren't exposed by
  the API yet, so they don't sync.
- **Desktop only** (`isDesktopOnly: true`).
- **Single account** per vault.
- Granola's API doesn't expose conference URLs, location, or invitee
  response status; those fields aren't in the synced frontmatter.
- Transcript turns can't be attributed to specific named attendees beyond
  the owner — Granola returns `microphone` / `speaker` / anonymous
  `Speaker A` labels. The `notes_on_speakers` frontmatter map lets you
  manually remap labels per note.

## License

MIT.
