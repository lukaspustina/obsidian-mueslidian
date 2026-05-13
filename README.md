# Müslidian

> **Granola** + **Obsidian** = Müsli. Your meetings, milled and poured straight into your second brain.

Müslidian is an Obsidian plugin that pulls your meetings out of [Granola](https://granola.ai) and turns them into proper markdown notes — frontmatter, attendees, AI summaries, transcripts, Person-note backlinks, the works. It's one-way (Granola → Obsidian), strictly opinionated about what it owns vs. what you own, and ruthless about preserving every keystroke of your handwritten notes across re-syncs.

If you take meeting notes in Granola but live in Obsidian, this is the bridge.

---

## What you actually get

Every synced meeting becomes one file that looks roughly like this:

```yaml
---
granola_id: not_o1SAoZZGj6aAdm
granola_updated_at: 2026-05-04T09:01:43Z
title: Project Phoenix
date: 2026-05-04
attendees: [alice@..., bob@..., diana@...]
tags: [Besprechung, todo, person/Alice_Anderson, person/Bob_Baker]
---
%% granola:meta:start %%
**Title:** Project Phoenix
**When:** 04.05.2026 14:30 → 04.05.2026 15:00
**Attendees:** [[Person - Alice Anderson|Alice]], [[Person - Bob Baker|Bob]], …
**Web:** https://app.granola.ai/notes/not_o1SAoZZGj6aAdm
%% granola:meta:end %%

%% granola:enhanced:start %%
## Teilnehmer
- Alice
- Bob
- Carter

## Decisions
- Roll out the new pipeline next sprint…
%% granola:enhanced:end %%

## My Notes

(your free-form scribbling lives here, untouched by every future sync)

%% granola:transcript:start %%
## Transcript
> [!quote]- Transcript
> **Alice (00:00):** Let's kick off…
%% granola:transcript:end %%
```

Three quietly important things going on:

1. **Attendee linking.** Anyone Granola detected as an attendee gets matched to a `Person - {First Last}.md` note in your vault. Matches become wikilinks in the meta callout and `person/...` tags in the frontmatter. Unmatched names land in the sync report with a click-to-create button.
2. **Typed-attendee discovery.** If your meeting notes start with a `## Teilnehmer` (or whatever you configure) bullet list, those names get pushed through the same matching pipeline. So "Alice" in your handwritten section finds `Person - Alice Anderson.md` automatically.
3. **Marker-block ownership.** Everything between `<!-- granola:* -->` (or the Obsidian-friendly `%% granola:* %%`) is owned by the plugin and gets overwritten on every sync. Everything outside — your `## My Notes`, your custom tags, your manual filings — is yours forever.

---

## Quick start

### Via BRAT (the easy path)

1. Install the **BRAT** community plugin in Obsidian.
2. BRAT settings → *Add Beta plugin* → paste this repo's URL.
3. Private repo? Add a GitHub personal access token in BRAT first.
4. Enable **Müslidian** under Settings → Community Plugins.

### Manual install (if you like doing things the hard way)

```bash
git clone https://github.com/<you>/obsidian-granola-meetings.git
cd obsidian-granola-meetings
cp .env.example .env   # point OBSIDIAN_PLUGIN_TARGET at <vault>/.obsidian/plugins
make setup
make install
```

Then enable **Müslidian** in Community Plugins.

### Two-minute setup

Open **Settings → Müslidian** and at minimum:

- **API key** — grab one from Granola → Settings → Connectors. Looks like `grn_…`.
- **Sync directory** — where notes land (default `Besprechungen`).
- **Person folder** — where your Person notes live (default `Personen`). Empty disables attendee linking.

Hit **Müslidian: Sync now** from the command palette and watch the status bar.

---

## The settings, distilled

The settings panel is grouped into eight sections; here are the knobs that actually change behavior.

### Sync & filtering

| Setting | What it does |
|---|---|
| **API key** | Bearer token. Format: `grn_*`. Stored at `data.json`; never logged. |
| **Sync directory** | Vault folder where notes are written. |
| **Allowed Granola folders** | Whitelist by Granola folder name. One per line. Empty = sync everything. |
| **Earliest creation date** | `YYYY-MM-DD` floor. Older notes are invisible. |
| **Document sync limit** | Cap on the N most recent notes. `0` = unlimited. |
| **Periodic interval (min)** | Auto-sync every N minutes. `0` disables. Range 0–1440. |
| **Skip existing notes** | Frozen-archive mode: never modify existing files, only create new ones. |

### Content

| Setting | What it does |
|---|---|
| **Include Meta block** | Title/When/Attendees/Web callout at the top of the note. |
| **Include "## My Notes" placeholder** | Adds the divider between Enhanced Notes and Transcript on first creation. Suppressed on re-sync if you already have `## My Notes` somewhere. |
| **Include Enhanced Notes block** | Granola's AI summary. |
| **Include full transcript** | Speaker-tagged transcript in a collapsed `> [!quote]-` callout. |
| **Marker comment style** | `<!-- … -->` (visible in Live Preview) or `%% … %%` (invisible in Live Preview and Reading Mode, visible only in Source Mode). Existing files migrate automatically when you switch. |

### Filenames

| Setting | What it does |
|---|---|
| **Filename template** | Placeholders: `{date} {time} {created_date} {updated_date} {title} {id}`. |
| **Date format** | Tokens: `YYYY`, `MM`, `DD`. e.g. `DD.MM.YYYY`. |
| **Time format** | Tokens: `HH`, `mm`. Used by `{time}` and as the first-choice collision disambiguator. |
| **Body date format / time zone** | Affects the meta callout's `When:` line. |

When two meetings would collide on the same generated filename, Müslidian appends ` HH-mm` from the meeting's start time. If that's also taken (or unavailable), it walks ` (2)`, ` (3)`, … instead of dropping a big ugly note id into your filenames.

### Person linking

| Setting | What it does |
|---|---|
| **My name** | Excluded from attendee tags and the unmatched-attendees report. |
| **Attendee tag template** | Default `person/{name}`. `{name}` is the underscored full name (e.g. `Alice_Anderson`). |
| **Typed-attendee section headings** | Headings in the enhanced notes whose bullet items are also treated as attendees. Default: `Teilnehmer`. One per line. |

### Additional frontmatter

A YAML textarea stamped onto new files only. Plugin-managed keys (`granola_*`, `title`, `date`, …) are rejected — *except* `tags`, which unions your values into the auto-generated `person/*` set. So this:

```yaml
tags: [Besprechung, todo]
priority: high
```

produces a final tag list of `[Besprechung, todo, person/Alice_Anderson, …]` and a `priority: high` line, on every newly-created note.

---

## Commands

- **Müslidian: Sync now** — pull all allowed Granola notes. Idempotent: re-running is safe.
- **Müslidian: Sync meeting by ID or URL** — pulls one note (bypasses the allowlist). Drops the `not_*` substring out of whatever text the editor has selected.
- **Müslidian: Test connection** — verify the API key without writing anything.

The status bar shows live sync phase (`listing notes…` → `diffing vault…` → `fetching N/M`) the moment you trigger a sync, and the relative time of the last sync once it's done. Click it to open the sync-report modal: counts, errors, plus a clickable list of unmatched attendees that creates Person notes via [QuickAdd](https://github.com/chhoumann/quickadd) (or a sensible stub fallback if QuickAdd isn't installed).

---

## Person linking, the deep cut

This is where Müslidian earns its keep. The matcher does two passes:

**Pass 1: Granola-detected attendees** — Exact normalized-name lookup. "Eve Evans" finds `Person - Eve Evans.md`. Matches become wikilinks in the meta callout and `person/Eve_Evans` in the frontmatter tags.

**Pass 2: Typed-attendee headings** — Want to make sure attendees Granola missed still get linked? Just keep typing your `## Teilnehmer` list during the meeting:

```markdown
## Teilnehmer
- Sam Sample (CTO, ExampleCorp)
- Alice
- Bob
- Carter
- Diana
```

Müslidian strips trailing parentheticals (`(CTO, ExampleCorp)` → discarded), then does a token-based match against your Person folder. Single-token entries like "Alice" or "Carter" match if exactly one Person note contains that token. Ambiguous? Two people named Lukas? The entry is reported as unmatched — no silent guess.

Names that don't resolve land in the **unmatched attendees** list in the sync report. One click creates a stub Person note (or invokes your QuickAdd "Person" choice if you have one) so the next sync picks them up.

Self-exclusion via the *My name* setting applies to both passes.

---

## The file contract

What the plugin owns, what you own. Take this seriously — it's the difference between "syncs cleanly forever" and "I lost my notes."

**Plugin-managed (rewritten on every sync):**
- All `granola_*` frontmatter keys.
- API-derived frontmatter keys: `title`, `date`, `event_title`, `meeting_start`, `meeting_end`, `owner_name`, `owner_email`, `organiser`, `attendees`, `invitees`, `unscheduled_attendees`, `calendar_event_id`, `web_url`.
- The `person/*` namespace inside `tags`.
- Body content between `<!-- granola:* -->` (or `%% granola:* %%`) marker pairs.

**Yours (never touched):**
- Any other frontmatter key — including `notes_on_speakers`, `filed_into`, custom anything.
- Tags outside the `person/*` namespace.
- Body content outside marker blocks. Yes, including `## My Notes`.

Marker blocks can be reordered freely. The plugin finds them by name, not position. You can also delete a marker block entirely (e.g. nuke the transcript on an old note); it will re-appear on the next sync unless you've toggled the corresponding "Include…" setting off.

---

## CLI

A standalone Node CLI lives at `bin/mueslidian.ts`, built to `dist/mueslidian.js`. Useful for poking at the Granola API without launching Obsidian.

```bash
export GRANOLA_API_KEY=grn_<key>
node dist/mueslidian.js test                          # → "OK (N notes)"
node dist/mueslidian.js list [--after YYYY-MM-DD] [--json]
node dist/mueslidian.js get <not_id> [--transcript] [--json]
node dist/mueslidian.js dump <not_id>                 # raw JSON, no transforms
```

`--json` emits NDJSON (one note per line) so you can pipe it to `jq` and stay in shell-land.

---

## Tips & tricks

**Hide markers from Live Preview.** Switch *Marker comment style* to `%% … %%`. The next sync migrates existing files automatically — both styles are recognized on read.

**Recurring meetings on the same day.** Use `{date} {time} {title}` as your filename template. Time comes from the meeting's calendar start. No calendar event? `{time}` substitutes to nothing and whitespace is collapsed, so you get `04.05.2026 Quick chat.md` instead of `04.05.2026  Quick chat.md`.

**Default tags for every new note.** Set *Additional frontmatter* to e.g. `tags: [Besprechung, todo]`. These union with the auto-generated `person/*` tags and survive every re-sync (because Müslidian only touches the `person/*` namespace on merge).

**Frozen archive mode.** Flip *Skip existing notes* on. Müslidian will create new notes but never touch existing ones. Good for retroactively pulling old meetings without rewriting your edits.

**Manual cleanup.** Files are named on creation only — Müslidian never renames. If you change your filename template later, only new notes pick it up.

**One-shot per-note sync.** Paste a Granola URL anywhere, select it, and run *Sync meeting by ID or URL*. Allowlist is bypassed. Good for "ugh, that one note I deleted by accident."

---

## Security

The API key sits in plain text at `<vault>/.obsidian/plugins/mueslidian/data.json`. Obsidian convention.

- If your vault is in Git, **gitignore that file**: `.obsidian/plugins/mueslidian/data.json`.
- If your vault syncs to iCloud / Dropbox / Syncthing, the key syncs with it. Decide whether that's OK.
- Müslidian never logs the API key. The CLI doesn't echo it either. `Authorization` headers are never serialized.

---

## Development

```bash
cp .env.example .env       # OBSIDIAN_PLUGIN_TARGET = <vault>/.obsidian/plugins
make setup                 # npm install
make doctor                # sanity-check the environment

make watch                 # esbuild watch → dist/
make link                  # symlink the vault plugin folder → ./dist (Hot Reload-friendly)

make check                 # typecheck + lint + test
make install               # build + copy dist/ → vault (production-style)
```

Run `make help` for the full target list.

The codebase is TypeScript, vitest for tests, esbuild for bundling. Strict TDD: pure functions in `src/{markdown,merge,attendees,vault}.ts` are exhaustively tested; only `src/main.ts` and `src/sync.ts` touch Obsidian's API. Mocks live in `tests/__mocks__/obsidian.ts`. Fixtures are scrubbed real-world API responses in `tests/fixtures/`.

---

## Limitations & honest caveats

- **Public API only.** Your handwritten Granola notes (the user-typed panel) aren't exposed by the public API yet, so they don't sync. Granola's enhanced summary does — and that's where typed-attendee discovery scans.
- **Desktop only.** `isDesktopOnly: true` in the manifest.
- **Single account per vault.** Multi-account would need a settings rethink.
- **No conference URLs, location, or invitee RSVP status.** Granola's API doesn't expose them.
- **Transcript speakers stay anonymous.** Granola returns `microphone`, `speaker`, and `Speaker A/B/C` labels — no attendee resolution beyond the owner. The `notes_on_speakers` frontmatter map (which you own) lets you remap labels per note.

---

## License

MIT. Go forth and sync.
