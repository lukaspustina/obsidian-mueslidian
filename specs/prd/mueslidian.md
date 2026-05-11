# PRD — Müslidian (Obsidian Granola Plugin)

**Status:** draft · **Author:** sam.sample · **Last updated:** 2026-05-11

> The plugin's user-facing name is **Müslidian**; its plugin id is `mueslidian`.
> Granola remains the data source; this PRD describes how Müslidian pulls
> from Granola into Obsidian.

## 1. Context

The user (Lukas) runs meetings through **Granola** (https://granola.ai), an
AI meeting-notes tool that records audio, transcribes it, and generates a
structured summary. Granola is good at capture; it's not where the user's
durable thinking lives.

The user's durable thinking lives in **Obsidian**, a local-first markdown
vault with extensive cross-linking — Person notes, Vorgang notes, project
notes, daily logs — all interlinked via wikilinks and tags. Today, meeting
content is **disconnected** from this vault: it's locked in Granola's app,
not searchable from Obsidian, not annotatable next to Person and project
notes.

The user also needs a **quality-gate workflow**: edit/curate meeting notes
inside Granola first, then promote them to Obsidian. Without that, every
half-baked Granola transcript would appear in the vault.

**The plugin closes this loop.** One-way sync from Granola's public REST
API into a configurable Obsidian folder. Idempotent re-syncs preserve the
user's annotations. Attendees automatically link to existing Person notes.
A folder-allowlist setting gates which notes are pulled.

The motivation is not novel functionality — comparable plugins exist — but
a v1 tailored to the user's specific Obsidian taxonomy: Person notes named
`Person - {First Last}.md`, `person/{First}_{Last}` tag scheme, German
filename conventions (`Besprechungen`), no `email` field in Person notes
(matching by name), a Granola-first quality-gate workflow.

## 2. Goals

- **G1** Granola meeting notes reachable from Obsidian within minutes of
  being processed and moved to an allowed folder.
- **G2** Any user annotation to a synced note (the `## My Notes` section,
  custom tags, custom frontmatter keys) survives every subsequent sync.
- **G3** Attendees auto-link to existing Person notes; the user's existing
  `person/*` tag taxonomy is fed automatically.
- **G4** Sync is idempotent: a sync with no Granola-side changes produces
  zero file writes and zero `getNote` API calls.
- **G5** No manual bookkeeping. The user never has to track which notes have
  already been pulled.

## 3. Non-goals

- **N1** Bidirectional sync. Granola is the source of truth.
- **N2** Mobile support. Desktop-only (`isDesktopOnly: true`) for v1.
- **N3** Real-time push. Polling, with latency on the order of minutes.
- **N4** Multiple Granola accounts in one vault.
- **N5** Mirroring Granola's folder hierarchy into Obsidian's folder
  hierarchy. Granola folders are exposed as metadata only.
- **N6** Editing Granola content from inside Obsidian.
- **N7** Ingesting Granola's local desktop data. Public API only.
- **N8** Backfilling the user's typed-in-Granola notes — not exposed by the
  public API.
- **N9** Public Community Plugin directory submission for v1. Distribution
  via BRAT against a private repo.

## 4. Users and scenarios

The user is the author. One operator, one vault, one Granola account.
Personal tool first; published shape is a secondary concern.

| # | Scenario | Outcome |
|---|---|---|
| S1 | Initial import after install | Sensible defaults; configurable bounds (date floor, hard count cap) keep the first sync manageable. |
| S2 | Quality gate | User edits and curates notes inside Granola; moves them to a designated "Reviewed" folder; only those reach Obsidian. |
| S3 | Daily sync | Manual command or periodic timer pulls newly-promoted notes; user adds follow-ups under `## My Notes`. |
| S4 | Debug a missing note | User pastes a Granola URL or selects an ID in any note; "Sync meeting by ID or URL" pulls it, bypassing the allowlist with a Notice. |
| S5 | Annotation survival | User-added paragraphs and custom tags survive when Granola regenerates the AI summary. |
| S6 | Attendee navigation | Attendee names render as wikilinks to existing Person notes; the meeting note's `tags` include each attendee's `person/*` tag automatically. |
| S7 | New attendee | Sync surfaces unmatched attendees; user clicks to launch their existing QuickAdd "Person" action pre-filled with the name. |
| S8 | Frozen archive | User switches to "Skip existing notes" mode; previously-synced files become immutable, future Granola changes ignored. |

## 5. Functional requirements

### 5.1 Sync triggers

- **FR1.1** A manual "Granola: Sync now" command pulls all allowed Granola
  notes (subject to filters in §5.2).
- **FR1.2** A periodic timer fires the same sync at a configurable interval
  (`0` disables). Catch-up: if the interval has elapsed while Obsidian was
  closed, fires once ~60s after Obsidian opens.
- **FR1.3** An on-demand command "Granola: Sync meeting by ID or URL"
  accepts a Granola note ID (`not_*`), a Granola web URL, or selected text
  in any editor. Bypasses §5.2 filters with a Notice flagging the override.
- **FR1.4** A "Sync now" button in the settings panel triggers FR1.1.
- **FR1.5** A single in-flight lock applies across triggers. Second
  invocation while a sync is running is a no-op with a Notice.

### 5.2 Filtering (applies to FR1.1 + FR1.2 only)

- **FR2.1** Folder allowlist: a multi-line list of Granola folder paths
  (`Synced`, `Work / Reviewed`). A note is synced if any of its folder
  paths matches an entry. Empty allowlist disables filtering. Notes with
  empty `folder_membership` are filtered out when allowlist is non-empty.
- **FR2.2** Earliest creation date: notes with `created_at` before this
  date are not pulled. Empty = no bound.
- **FR2.3** Document sync limit: hard cap on the N most recent notes
  considered. `0` = no cap.

### 5.3 File contract

Each Granola note maps to one markdown file in the configurable
**Sync directory** (default `Besprechungen`). Filename comes from a
configurable template using placeholders `{date}`, `{created_date}`,
`{updated_date}`, `{title}`, `{id}`, with date tokens rendered via a
configurable date format (default `DD.MM.YYYY`). Filename is set on
creation only — never auto-renamed when Granola data changes.

**Frontmatter — plugin-managed (overwritten on every sync):**

| Key | Source | Notes |
|---|---|---|
| `granola_id` | API id | Primary key. |
| `granola_updated_at` | API updated_at | Change-detection. |
| `granola_synced_at` | now | Audit trail. |
| `granola_folders` | API folder_membership | Path-rendered. |
| `title` | API title | |
| `event_title` | API calendar_event.event_title | Omitted if equal to `title`. |
| `date` | calendar_event.scheduled_start_time or created_at | `YYYY-MM-DD`. |
| `meeting_start` / `meeting_end` | calendar_event | Omitted if no calendar event. |
| `owner_name`, `owner_email` | API owner | |
| `organiser` | calendar_event.organiser | Omitted if absent. |
| `attendees` | API attendees | Array of `{name, email}` objects. |
| `invitees` | calendar_event.invitees | Flat email array. Omitted if no calendar event. |
| `unscheduled_attendees` | derived: attendees − invitees | Emails. Omitted if empty or no calendar event. |
| `calendar_event_id` | calendar_event | |
| `web_url` | API web_url | |
| `tags` | merged | Always contains `meeting`, `granola`. Attendee tags added per template (§5.4). User-added tags preserved. |

**Frontmatter — user-owned (never overwritten):**

- `notes_on_speakers` (optional map, used by transcript rendering — §5.4).
- Any other key the user adds.
- User-added entries in `tags` outside the plugin's namespaces.
- Keys stamped from the `Additional frontmatter` setting at creation time
  (§5.5) — not re-applied on subsequent syncs.

**Body — plugin-managed marker blocks:**

```
<!-- granola:meta:start -->
# {title}
> [!info] Meeting
> **When:** ...
> **Attendees:** [[Person - …|…]], …
> ...
<!-- granola:meta:end -->

<!-- granola:enhanced:start -->
## Enhanced Notes
{summary_markdown}
<!-- granola:enhanced:end -->

## My Notes
(placeholder; never touched by plugin once written)


<!-- granola:transcript:start -->
## Transcript
> [!quote]- Transcript
> ...
<!-- granola:transcript:end -->
```

- Each marker block is independently toggleable (§5.5). When a toggle is
  on and a block is missing, it's inserted; meta after frontmatter,
  transcript at end, enhanced between them.
- Disabling a toggle later **does not** remove an existing block (no
  destructive cleanup).
- Anything outside every marker block is preserved verbatim across syncs —
  including the `## My Notes` placeholder once it exists.
- Marker block order is not enforced: the user may move blocks; the plugin
  finds them by marker name.

### 5.4 Person linking

- **FR4.1** Plugin scans a configurable **Person folder** (default
  `Personen`) for files named `Person - {First Last}.md`.
- **FR4.2** Match key is normalized attendee name (trim, collapse spaces,
  case-fold) compared to the `{First Last}` portion of each filename. Old
  Person notes without a `person_tag` frontmatter key still participate;
  the plugin derives `person_tag` as `{template prefix}/{First}_{Last}`.
- **FR4.3** Matched attendees: a tag generated from the **Attendee tag
  template** (default `person/{name}`; `{name}` = underscored attendee
  name) is added to the meeting note's `tags`. In the meta callout the
  attendee is rendered as a wikilink to their Person note.
- **FR4.4** Unmatched attendees: rendered as plain names in the callout;
  collected into the sync report's "unmatched attendees" list. Each entry
  in the list is a click-target that launches the user's existing QuickAdd
  "Person" command pre-filled with the attendee's name.
- **FR4.5** Self-exclusion: attendees whose name equals the **My name**
  setting (case-insensitive) are excluded from attendee tag generation but
  still appear in `attendees` frontmatter and the meta callout.
- **FR4.6** Transcript rendering: `microphone` source → owner's name;
  `speaker` source → `diarization_label` if present else "Speaker". A
  per-note `notes_on_speakers` map (user-owned) remaps labels.
- **FR4.7** Tag namespace ownership: the plugin manages only the tag prefix
  produced by the current template. Tags from a former template are not
  cleaned up automatically (documented behavior).

### 5.5 Settings

| Group | Setting | Default | Notes |
|---|---|---|---|
| Auth | API key | empty | Required. `grn_*`. Inline `[Test]` button. |
| Locations | Sync directory | `Besprechungen` | |
| Locations | Person folder | `Personen` | Empty disables linking. |
| Filtering | Allowed Granola folders | empty | Multi-line, OR semantics. |
| Filtering | Earliest creation date | empty | |
| Filtering | Document sync limit | `0` | `0` = unlimited. |
| Trigger | Periodic interval (min) | `0` | `0` = off. Range 0–1440. |
| Mode | Skip existing notes | off | Override: when on, plugin only creates files; existing files untouched. |
| Filename | Filename template | `{date} {title}` | Placeholders per §5.3. |
| Filename | Date format (filenames) | `DD.MM.YYYY` | Tokens: `YYYY`, `MM`, `DD`. |
| Content | Include `## My Notes` placeholder | on | New files only. Toggling off doesn't remove existing placeholders. |
| Content | Include Enhanced Notes block | on | |
| Content | Include full transcript block | on | |
| Display | Date format in body | Local | Frontmatter timestamps always ISO. |
| Display | Time zone in body | Local | |
| Person | My name | empty | §5.4 self-exclusion. |
| Person | Attendee tag template | `person/{name}` | |
| Custom | Additional frontmatter | empty | One `key: value` per line. Stamped at file creation only — changing later does not re-apply. |
| Action | [Sync now] | — | Triggers FR1.1. |
| Action | [View last sync report] | — | Opens persisted report from `data.json`. |
| Action | [Clear filtered-out cache] | — | Empties the per-ID cache. Confirmed via dialog. |

### 5.6 Identity & change detection

- **FR6.1** Primary key is `granola_id` in frontmatter. Vault index built
  on each sync from Obsidian's `metadataCache` — no separate state file.
- **FR6.2** A note is fetched in full only when (a) its ID is new to the
  vault and not in the filtered-out cache, or (b) its `updated_at` in the
  list response exceeds the stored `granola_updated_at`.
- **FR6.3** A `filtered_out` map in the plugin's `data.json` caches IDs
  filtered out by the allowlist (with their `updated_at`), so the plugin
  doesn't refetch unchanged filtered notes on every sync.
- **FR6.4** A delisted note (previously synced, no longer in an allowed
  folder) is left in place. The sync report counts it.
- **FR6.5** A note deleted from the vault is recreated on next sync.

### 5.7 CLI

A standalone command-line tool (`bin/granola.ts`) sharing the API client
with the plugin. Authentication via `GRANOLA_API_KEY` env var. Useful for
testing the API outside Obsidian.

Subcommands:
- `granola test` — verify the API key works.
- `granola list [--after DATE] [--json]` — list note metadata.
- `granola get <id> [--transcript] [--json]` — fetch one note.
- `granola dump <id>` — raw JSON dump for inspection.

### 5.8 Diagnostics and observability

- **FR8.1** Settings tab: `[Test connection]` calls `listNotes({})` and
  shows OK or the error inline next to the API key field.
- **FR8.2** Status-bar item shows live sync state: `Granola: syncing 12/47`
  · `Granola: 2m ago` · `Granola: error (click to retry)`.
- **FR8.3** Each sync produces a structured report persisted as
  `last_sync_report` in `data.json`. Report contains aggregate counts:
  listed, created, updated, unchanged, filtered, delisted, errors,
  unmatched attendees, duration. Errors include per-note ID + reason.
  Unmatched attendees include per-attendee names with source note titles.
- **FR8.4** No periodic-sync Notice fires when the report has no created /
  updated / errored entries. Manual sync always notifies on completion.

## 6. Non-functional requirements

| # | Category | Requirement |
|---|---|---|
| NFR1 | Performance | First sync of 500 notes completes in under 2 minutes against a healthy API. |
| NFR2 | Performance | Steady-state sync with no Granola-side changes completes in under 5 seconds (list-only, no body fetches). |
| NFR3 | Idempotency | A no-op sync produces zero file writes and zero `getNote` API calls. |
| NFR4 | API hygiene | Plugin respects rate limits (5 req/s sustained, 25/5s burst). 429 retried with exponential backoff. 404 on `getNote` treated as "still processing" — skip, retry next sync, not counted as error. |
| NFR5 | Reliability | Files rendered fully in memory before writing — partial writes impossible. An aborted sync leaves the vault consistent. |
| NFR6 | Failure handling | Per-note errors do not abort the sync. After 5 consecutive non-404 errors from `getNote`, the sync aborts with `Granola API unhealthy`. A failure of the initial `listNotes` is always fatal. |
| NFR7 | Concurrency | A single in-flight lock across manual + periodic + on-demand triggers. Re-entry is a no-op. |
| NFR8 | Security | API key never logged or echoed. README warns about plain-text storage in `data.json`. Plugin sources contain no real API keys. |
| NFR9 | Observability | Status-bar item + persisted sync report cover the operational surface needed to diagnose any sync without re-running it. |

## 7. Constraints and assumptions

- **C1** Granola public API: `https://public-api.granola.ai/v1`. Bearer
  auth with `grn_*` keys. Endpoints used: `GET /v1/notes`,
  `GET /v1/notes/{id}` (with `include=transcript`).
- **C2** API fields available are listed in §5.3. Fields **not** in the
  API and therefore unsupported by this plugin: user-typed handwritten
  Granola notes, conference URL (Zoom/Meet/Teams), meeting location,
  event description, invitee response status, recurring info, named
  transcript attribution beyond the owner.
- **C3** The list endpoint returns metadata only. `folder_membership` is
  only on the single-note endpoint — folder-allowlist filtering therefore
  costs one `getNote` per never-before-seen ID. Steady state is cheap
  because of the filtered-out cache.
- **C4** No webhooks. Sync is poll-driven.
- **C5** Obsidian's plugin API is desktop-only here. We target plugin
  manifest `minAppVersion ≥ 1.4.0`.
- **C6** Distribution: private GitHub repo, BRAT-installed (requires a
  GitHub personal access token configured in BRAT).
- **C7** API key resides in `<vault>/.obsidian/plugins/granola-sync/data.json`
  in plain text. Mitigated by README guidance and an optional Settings-tab
  warning if a `.git` directory is detected at the vault root.

## 8. Out of scope / future work

- **F1** Bidirectional sync.
- **F2** Mobile platform support.
- **F3** Multiple Granola accounts.
- **F4** Mirroring Granola's folder hierarchy into Obsidian's folder
  hierarchy.
- **F5** Speaker remapping UI beyond per-note `notes_on_speakers`.
- **F6** Auto-creation of Person notes (current design is suggest-only).
- **F7** Ingesting Granola's local desktop data for user-typed notes.
- **F8** Public Community Plugin directory submission.
- **F9** Automatic cleanup of stale tags when the attendee tag template
  changes.
- **F10** macOS Keychain storage for the API key.
- **F11** Granola "My Notes" toggle wired to the actual user-typed notes
  field — pending the API exposing it.

## 9. Acceptance criteria

The plugin is shippable for v1 when all of the following hold against a
test vault seeded with at least 20 real Granola notes (curated set) and a
handful of Person notes.

1. **Install/build**: `make setup && make build && make install` produces
   a working plugin in the test vault. `make doctor` reports OK.
2. **Test pass**: `make check` (`typecheck && lint && test`) is green.
3. **Settings round-trip**: every setting persists across Obsidian
   restarts. `[Test connection]` reports OK with a valid key, an actionable
   error with an invalid one.
4. **Fresh sync**: against a fresh sync directory, "Granola: Sync now"
   populates files matching the allowed set (or full set if allowlist
   empty). File count equals expected. Filenames respect template and
   date-format settings.
5. **Idempotency**: a second consecutive "Sync now" produces zero file
   writes and zero `getNote` API calls (verified via console logs).
6. **Annotation survival**: editing `## My Notes`, adding a custom tag in
   frontmatter, adding a custom frontmatter key — all survive the next
   sync; only marker-block contents change.
7. **Granola edit propagates**: editing a meeting title in Granola — next
   sync rewrites only that file's `granola:meta` block and frontmatter
   `title`; `granola_updated_at` advances.
8. **Skip-existing mode**: enabling the setting and resyncing leaves every
   existing file byte-identical; new IDs still produce new files.
9. **Attendee match → tag + wikilink**: a meeting with attendee
   "Eve Evans" (matching `Personen/Person - Eve Evans.md`)
   produces `person/Eve_Evans` in `tags` and
   `[[Person - Eve Evans|Eve Evans]]` in the meta callout.
10. **Self-exclusion**: an attendee matching `My name` does not produce a
    `person/*` tag but does appear in `attendees` frontmatter.
11. **Allowlist filtering**: a note in a non-allowed folder produces no
    file; appears in `filtered_out`; subsequent syncs don't refetch unless
    its `updated_at` advances.
12. **Delisting**: a previously synced note removed from allowed folders
    in Granola leaves its Obsidian file in place; the sync report counts
    it.
13. **On-demand by URL**: pasting a Granola web URL into the on-demand
    command pulls the note, emitting a Notice if it's outside the allowlist.
14. **CLI**: `granola test`, `granola list`, `granola get <id>` all
    succeed from a terminal with `GRANOLA_API_KEY` set; output formats
    (text and `--json`) match documented schema.
15. **Periodic**: with interval `1`, the periodic timer fires; status bar
    advances; Notices fire only on change or error.
16. **Catch-up**: closing Obsidian past an interval and reopening fires
    one sync ~60s after open.
17. **Failure handling**: a deliberately-bad note ID returns 404, is
    counted as "still processing", does not error. Five consecutive
    forced 500s abort the sync with `Granola API unhealthy`.
18. **Security**: full Obsidian console output across a sync contains no
    occurrence of the literal API key string.

## 10. Open questions

None blocking. Items deferred to SDD:
- Exact Vitest project structure and fixture conventions.
- Exact rendered Markdown for the meta callout when calendar_event is null
  (edge formatting).
- QuickAdd integration details — whether to call its programmatic API or
  replicate template-apply ourselves (verified in implementation Phase 1).

## 11. References

- Granola API docs: https://docs.granola.ai/introduction
- Subsequent SDD: `specs/sdd/granola-sync.md` (to be generated via `/sdd`)
- Project `CLAUDE.md` (to be created at repo root)
