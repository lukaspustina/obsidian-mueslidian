# SDD: Müslidian

Status: Ready for Implementation
Original: specs/sdd/mueslidian.md
Refined: 2026-05-11
PRD: specs/prd/mueslidian.md

## Overview

Müslidian is a one-way Obsidian plugin that pulls meeting notes from Granola into the vault as markdown files, preserving user annotations across re-syncs. It is built in four committable phases: Phase 1 lands a typed API client plus a standalone CLI; Phase 2 lands the file contract (pure render + merge) behind a single on-demand command; Phase 3 lands full sync orchestration with filtering and the filtered-out cache; Phase 4 lands the periodic timer, status bar, Person-note QuickAdd integration, and README.

## Context & Constraints

- **Stack**: TypeScript, esbuild, Obsidian plugin API (desktop-only, `isDesktopOnly: true`, `minAppVersion ≥ 1.4.0`), Vitest, `js-yaml` (only runtime dependency beyond the `obsidian` peer types).
- **HTTP**: Obsidian's `requestUrl` inside the plugin (CORS-safe), native `fetch` in the CLI. `GranolaClient` accepts a transport function as a constructor parameter so tests can inject a spy; see §API Contracts.
- **TDD with Red → Green → Refactor** per `CLAUDE.md`. Pure functions first; mock only at process boundaries (Granola HTTP + Obsidian `App`).
- **Marker-block file contract** — three named blocks (`granola:meta`, `granola:enhanced`, `granola:transcript`). Content outside markers and unknown frontmatter keys are user-owned and never touched.
- **API key** lives in `<vault>/.obsidian/plugins/mueslidian/data.json`, plain text. Never logged. README warns about plain-text storage.
- **Distribution**: private GitHub repo, BRAT-installed.
- **Linter**: ESLint with `@typescript-eslint`; config at `.eslintrc.cjs`; included in Phase 1 scaffolding.
- **NFR2 (steady-state ≤ 5 s) is bounded** to vaults of up to 500 notes against an API responding in under 2 s; larger corpora degrade gracefully without failures.
- **AC5 precondition**: the zero-write, zero-fetch idempotency guarantee holds only after a successful warming sync with no cache clear in between.
- **QuickAdd is a soft runtime dependency**: detected at click-time via `app.plugins.plugins['quickadd']?.api`; absent QuickAdd falls back to stub-file creation (see FR34, Error Handling).
- **Date formatting** (filename + body) is a ~10-line pure function in `src/markdown.ts` using `Date.getUTCFullYear/Month/Date` plus `bodyTimeZone` adjustment. No date library is added; `js-yaml` remains the only runtime dep.
- **On-demand URL parsing SSRF mitigation**: the on-demand command extracts the note ID from user input via the regex `/not_[a-zA-Z0-9]{14}/` (substring match). `GranolaClient` always constructs its target URL from the hardcoded `https://public-api.granola.ai/v1` base; user-supplied strings never reach `requestUrl` or `fetch` directly.
- **Obsidian UI primitive mocking policy**: `Notice` and `Modal` are mocked in Vitest via `vi.mock('obsidian')` with a manual mock at `tests/__mocks__/obsidian.ts`. Tests assert against the mock's captured call args. No per-function `notify` callback is introduced; the `vi.mock` boundary is the single policy.

## Architecture

Three layers sharing one typed API client:

```
┌──────────────────────────────────┐
│  Obsidian plugin (src/main.ts)    │
│  - commands, settings, status     │
│  - periodic timer, lock           │
└──────────────┬───────────────────┘
               │
       ┌───────┴───────┐
       │   src/sync.ts │  orchestrate list → diff → fetch → render → write
       └───────┬───────┘
               │
   ┌───────────┼───────────┐
   │           │           │
┌──┴───┐  ┌────┴────┐ ┌────┴────┐
│markdwn│ │  merge  │ │  vault  │   pure functions
│  .ts  │ │   .ts   │ │   .ts   │   (frontmatter + body + filename)
└───┬───┘  └─────────┘ └─────────┘
    │
┌───┴───────────┐
│ src/attendees │   Person matching, tag generation, self-exclusion
└───────────────┘

┌───────────────┐
│  src/granola  │   API client. Used by both plugin and CLI.
└───────┬───────┘
        │
┌───────┴───────┐
│  bin/mueslidian.ts  │   CLI: test, list, get, dump
└───────────────┘
```

One-way: Granola → Obsidian. No write-back.

`syncAll` delegates pure diffing to `diffNotes(vaultIndex, listed, state, settings): DiffResult` so list-pagination, diff logic, filtered-out cache lifecycle, circuit-breaker, progress reporting, and delistment detection are each independently testable.

## Requirements

**API client (Phase 1):**
1. The system shall expose `listNotes({ createdAfter?: string; cursor?: string }): Promise<ListResponse>` and `listAllNotes({ createdAfter?: string }): AsyncGenerator<Note>` for paginated metadata access.
2. The system shall expose `getNote(id: GranolaNoteId, opts: { includeTranscript: boolean }): Promise<NoteWithBody | null>`, where `null` indicates a 404 response (still processing). Only 404 returns `null`; HTTP 401 throws `InvalidApiKey`, all other non-2xx statuses throw `GranolaHttpError`.
3. The system shall retry HTTP 429 with exponential backoff (250 ms, 500 ms, 1000 ms; max 3 attempts) and treat a final 429 as a recoverable per-call error.
4. The system shall reject HTTP 401 immediately (no retries) with an `InvalidApiKey` error.
5. The system shall never log the API key or the full `Authorization` header in any output path.

**CLI (Phase 1):**
6. The CLI shall expose subcommands `test`, `list [--after DATE] [--json]`, `get <id> [--transcript] [--json]`, `dump <id>`.
7. The CLI shall read `GRANOLA_API_KEY` from the environment and exit with an actionable error message on stderr if absent.
8. When saving the API key (settings tab) or constructing `GranolaClient` (CLI): if non-empty and not matching `/^grn_[a-zA-Z0-9]+$/`, display an inline warning (settings tab) or print to stderr (CLI) without blocking the save or execution.

**File contract (Phase 2):**
9. The system shall render a meeting note with three marker-delimited blocks: `<!-- granola:meta:start -->` … `<!-- granola:meta:end -->`, `<!-- granola:enhanced:start -->` … `<!-- granola:enhanced:end -->`, `<!-- granola:transcript:start -->` … `<!-- granola:transcript:end -->`.
10. The system shall write each block only when its corresponding setting toggle (`includeEnhancedNotes`, `includeTranscript`) is on; the meta block is unconditional. When a toggle is on and a block is absent in the existing file, the block is inserted immediately after the preceding block's `:end` marker, or after the YAML frontmatter closing `---` if no prior block exists.
11. The system shall insert a `## My Notes` placeholder between the enhanced-end marker and the transcript-start marker on file creation, when `includeMyNotesPlaceholder` is on AND the exact string `## My Notes` does not already appear anywhere outside a marker block (case-sensitive match).
12. The system shall preserve all content outside marker blocks verbatim across re-syncs, including the `## My Notes` section once written.
13. The system shall preserve all frontmatter keys not in the plugin-managed set verbatim across re-syncs, including `notes_on_speakers` and user-added tags outside the attendee-tag namespace.
14. The system shall generate the filename from `filenameTemplate` and `filenameDateFormat` settings on file creation only; it shall never auto-rename an existing file when Granola data changes.
15. The system shall match attendees against `personFolder` by normalized name (trim, collapse spaces, case-fold) compared to the `{First Last}` portion of files named `Person - {First Last}.md`. The scan covers only `settings.personFolder`.
16. The system shall add a tag for each matched attendee using `attendeeTagTemplate` (default `person/{name}`, where `{name}` is the underscored full name) to the meeting note's `tags` frontmatter array.
17. The system shall exclude any attendee whose name matches the `myName` setting (case-insensitive) from attendee tag generation; that attendee still appears in the `attendees` frontmatter array and in the meta callout.
18. The system shall render matched attendees in the meta callout as wikilinks (`[[Person - {First Last}|{First Last}]]`); unmatched attendees are rendered as plain text.
19. The system shall remove from `tags` any value whose prefix matches the current `attendeeTagTemplate` namespace (the literal substring before `/{name}` in the template; for default `person/{name}` the prefix is `person`) that does not correspond to a current attendee. Tags from any prior template namespace are left untouched as user-owned.
20. The system shall stamp `additionalFrontmatter` key/value pairs into a file on creation only (first write of a file, regardless of trigger); subsequent setting changes shall not rewrite existing files. When stamping `additionalFrontmatter`, the plugin shall silently skip (with `console.warn`) any key that collides with a plugin-managed key — the full `granola_*` namespace plus `meeting_start`, `meeting_end`, `web_url`, `attendees`, `tags`.
21. `renderMeeting` omits disabled blocks from its output; `mergeMeetingFile` preserves any existing block whose marker tag is not present in the new render output.
22. Disabling a block toggle later does not remove an existing block (no destructive cleanup).
23. Marker block order is not enforced: the plugin finds blocks by marker name, not position. The user may reorder blocks in the file.
24. If a `<!-- granola:*:start -->` marker is found without a matching `:end` marker, `mergeMeetingFile` treats the block as absent and overwrites from the start tag to the next `<!-- granola:*:start -->` tag or EOF, whichever comes first.
25. Timestamps in plugin-managed frontmatter fields (`granola_updated_at`, `granola_synced_at`, `meeting_start`, `meeting_end`) come from the API response or the wall-clock at write time (`granola_synced_at`), never from a re-rendered `Date.now()` mid-run, ensuring idempotent file hashes for unchanged notes.
26. `filenameFor` replaces characters `/\:*?"<>|` with `-` and truncates results to 200 characters. When `title` is `null`, the fallback token is `"Untitled"`. Collision detection (appending ` {full GranolaNoteId}` before `.md`, e.g. `27.01.2026 Q1 Review not_abc1234567890.md`) is the caller's responsibility in `vault.ts`, which supplies the set of existing filenames as a third parameter `existingFilenames: Set<string>`.
27. `splitFrontmatter` treats a file with no leading `---` as having an empty frontmatter map; it returns `{ fm: {}, body: fullContent }`.
28. `buildVaultIndex` iterates `app.vault.getMarkdownFiles()`, filters by `syncDirectory` path prefix, calls `app.metadataCache.getFileCache(file)` per file, and skips files where `getFileCache` returns `null` or where `frontmatter.granola_id` is not a string (enforced by `typeof v === 'string'` guard). When two files share the same `granola_id`, `buildVaultIndex` iterates files sorted ascending by `file.path` and the first wins (later entries are silently overwritten with a `console.warn`).
29. `personFolder` and `syncDirectory` are passed through Obsidian's `normalizePath()` at settings-load time and rejected (reverted to the previous value with an inline warning in the settings tab) if they resolve outside the vault root or contain `..` segments. The stub Person-note filename applies the same `filenameFor` sanitization to the attendee name before constructing the path.
30. `additionalFrontmatter` is parsed with `js-yaml.load` in a `try/catch`; on parse error the plugin emits `console.warn` and treats the field as empty (no keys are stamped).
31. `allowedFolders` matching: a note passes if any element of `folder_membership` has `name` exactly equal (case-sensitive) to any element of `allowedFolders`. A note with an empty `folder_membership` is filtered out when `allowedFolders` is non-empty.
32. `earliestCreationDate` comparison: the `YYYY-MM-DD` floor is parsed as midnight UTC; `created_at` is compared as UTC. Notes with `created_at` before midnight UTC of that date are excluded.

**Sync orchestration (Phase 3):**
33. The system shall provide commands "Müslidian: Sync now" (manual, full), "Müslidian: Sync meeting by ID or URL" (on-demand, single; accepts a `not_*` ID extracted via `/not_[a-zA-Z0-9]{14}/` from the input string or selected text in any editor), and "Müslidian: Test connection".
34. The system shall apply, in order, to manual and periodic triggers: (a) `documentSyncLimit` cap (`syncAll` fetches all pages first, then `diffNotes` applies the cap on the complete list, sorted descending by `created_at`), (b) `earliestCreationDate` floor, (c) `allowedFolders` allowlist. An empty `allowedFolders` list disables folder filtering — all notes pass. The on-demand by ID/URL command bypasses all three filters and emits a Notice if the note is outside the allowlist.
35. The system shall maintain a `filteredOut: Record<GranolaNoteId, string>` cache (id → `updated_at`) for notes excluded by the folder allowlist. Cache entries are re-evaluated only when the note's `updated_at` advances in the list response or when the user confirms `[Clear filtered-out cache]`.
36. Notes excluded by `earliestCreationDate` or `documentSyncLimit` shall NOT be cached in `filteredOut`; they are re-evaluated on every sync.
37. The system shall fetch a note's body only when (a) its ID is new to the vault and not in `filteredOut`, or (b) its `updated_at` in the list response exceeds the stored `granola_updated_at` for that vault file.
38. The system shall treat a 404 on `getNote` as "still processing": the note is skipped, counted as `stillProcessing`, and no error is recorded. `syncAll` must not conflate a thrown error (401, 5xx) with a `null` return from `getNote`.
39. The system shall abort a sync with `aborted: 'api_unhealthy'` after 5 consecutive non-404 errors from `getNote`; partial progress is preserved. A `listNotes` failure on the first page sets `aborted: 'list_failed'` and aborts immediately.
40. The system shall hold a single in-flight lock across all triggers. Re-entry while a sync is running produces a Notice ("Müslidian sync already running") and returns immediately.
41. The system shall persist a `SyncReport` in `data.json` after every sync, including the aborted state.
42. The system shall leave files in place when a previously-synced note is no longer in the allowlist; the report counts such notes as `delisted`.

**UX polish (Phase 4):**
43. The system shall run a periodic sync at `periodicIntervalMinutes` via an injectable scheduler (default: `window.setInterval`); setting the value to 0 disables the timer; changing the value at runtime cancels the existing interval and starts a fresh one from that moment.
44. The system shall fire one catch-up sync 60 seconds after Obsidian opens if `(nowMs - lastSyncAtMs) / 60_000 >= periodicIntervalMinutes`. No catch-up fires when `periodicIntervalMinutes === 0`. The 60-second delay is injected via a `delayFn: (ms: number) => Promise<void>` parameter to the catch-up wiring so tests can resolve it immediately.
45. The `periodicIntervalMinutes` setting input is clamped to [0, 1440] in the settings tab UI; values outside this range loaded from `data.json` are clamped silently on plugin load with a `console.warn`.
46. A status-bar item shall display: `Müslidian: syncing N/M` during a sync; `Müslidian: <relative>` when idle (format: `2 min ago`, `1 hr ago`, `>24 hr ago`; re-rendered every 30 seconds); `Müslidian: error` after a failed sync. Clicking the item opens a modal displaying the last `SyncReport`.
47. Periodic syncs shall NOT show a completion Notice when `created + updated + errors.length === 0`; manual syncs shall always show a completion Notice.
48. The system shall surface unmatched attendees from the last sync report as a clickable list in the sync report modal. Each click first checks for QuickAdd via `app.plugins.plugins['quickadd']?.api`; if present, it invokes `app.plugins.plugins['quickadd'].api.executeChoice('Person', { name: attendeeName })`. If `app.plugins.plugins['quickadd']?.api` is falsy, the click creates a stub at `<personFolder>/Person - {name}.md` (with `{name}` sanitized via `filenameFor`) with frontmatter `person_tag: person/{First}_{Last}`, `note_type: person_note`, `tags: [Person]`, and fires a Notice ("Created stub at …").
49. `SyncReport.unmatchedAttendees` is deduplicated by name; duplicate appearances across notes are merged into one entry (each entry carries an array of source note titles).
50. When `skipExistingNotes` is on, the system shall only create new files for `granola_id` values not present in the vault; existing files shall be byte-identical after the run and counted as `skippedExisting`.
51. `renderMeeting` receives `notes_on_speakers` as an explicit map `Record<string, string>` parsed from `existing` frontmatter (when non-null) by the caller before invoking `renderMeeting`, and passes it to `renderTranscript`. When `existing` is null, the map is empty.
52. `renderMeeting` does not branch on `existing` to determine whether to stamp `additionalFrontmatter`; instead, the caller in `sync.ts` / `main.ts` supplies a boolean `isCreation` and calls a separate `stampAdditionalFrontmatter(content: string, additional: Record<string, string>, isCreation: boolean): string` helper after `mergeMeetingFile`.

## File & Module Structure

```
.
├── manifest.json              # Obsidian plugin manifest (id: mueslidian)
├── package.json
├── tsconfig.json
├── esbuild.config.mjs         # dist/main.js for plugin; dist/mueslidian.js for CLI
├── versions.json              # plugin version → minAppVersion map
├── Makefile                   # targets: help, setup, doctor, build, watch, install, check
├── .eslintrc.cjs              # ESLint + @typescript-eslint config
├── .gitignore                 # node_modules, dist, data.json, .env
├── .env.example               # OBSIDIAN_PLUGIN_TARGET=<path>
├── README.md
├── CLAUDE.md
├── bin/
│   └── mueslidian.ts          # CLI entry; subcommands: test, list, get, dump
├── src/
│   ├── main.ts                # Plugin class; registers commands, status bar, timer
│   ├── settings.ts            # MuesliSettings interface + defaults + settings tab UI
│   ├── types.ts               # API + plugin types (imports TFile from 'obsidian' where needed)
│   ├── granola.ts             # GranolaClient (listNotes, listAllNotes, getNote)
│   ├── markdown.ts            # renderMeeting, renderFrontmatter, renderMetaCallout,
│   │                          #   renderEnhanced, renderTranscript,
│   │                          #   stampAdditionalFrontmatter, formatDate (pure)
│   ├── merge.ts               # splitFrontmatter, replaceMarkerBlock, mergeMeetingFile
│   ├── vault.ts               # filenameFor, findExistingByGranolaId, ensureFolder,
│   │                          #   buildVaultIndex
│   ├── attendees.ts           # AttendeeIndex type, buildAttendeeIndex, matchAttendee,
│   │                          #   generateTag, shouldExcludeSelf
│   └── sync.ts                # diffNotes, syncAll, SyncReport
├── tests/
│   ├── __mocks__/
│   │   └── obsidian.ts        # Manual vi.mock for Notice, Modal, TFile, App, etc.
│   ├── fixtures/
│   │   ├── note-with-transcript.json
│   │   ├── note-no-calendar.json
│   │   ├── note-still-processing.404.json
│   │   ├── list-page-1.json
│   │   └── list-page-2.json
│   ├── granola.test.ts
│   ├── markdown.test.ts
│   ├── merge.test.ts
│   ├── vault.test.ts
│   ├── attendees.test.ts
│   └── sync.test.ts
└── specs/
    ├── prd/mueslidian.md
    ├── prd/mueslidian.refine-findings.md
    └── sdd/mueslidian.md          # this file
```

## Data Models

```ts
// src/types.ts

// API shapes (mirror Granola public API verbatim)

export type GranolaNoteId = string;  // pattern: ^not_[a-zA-Z0-9]{14}$

export interface User { name: string | null; email: string; }
export interface CalendarInvitee { email: string; }
export interface CalendarEvent {
  event_title: string | null;
  invitees: CalendarInvitee[];
  organiser: string | null;
  calendar_event_id: string | null;
  scheduled_start_time: string | null;   // ISO 8601
  scheduled_end_time: string | null;     // ISO 8601
}
export interface Folder {
  id: string;                            // pattern: ^fol_[a-zA-Z0-9]{14}$
  object: 'folder';
  name: string;
  parent_folder_id: string | null;
}
export interface Speaker {
  source: 'microphone' | 'speaker';
  diarization_label?: string;
}
export interface TranscriptTurn {
  speaker: Speaker;
  text: string;
  start_time: string;   // seconds as string, e.g. "0", "12"
  end_time: string;
}
export interface Note {
  id: GranolaNoteId;
  object: 'note';
  title: string | null;
  owner: User;
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
}
export interface NoteWithBody extends Note {
  web_url: string;
  calendar_event: CalendarEvent | null;
  attendees: User[];
  folder_membership: Folder[];
  summary_text: string;
  summary_markdown: string | null;
  transcript: TranscriptTurn[] | null;
}
export interface ListResponse {
  notes: Note[];
  hasMore: boolean;
  cursor: string | null;
}

// Transport interface — injected into GranolaClient for testability.
// body is pre-parsed JSON (the plugin adapter reads response.json as a data
// property, not a method call, from Obsidian's requestUrl with { throw: false }).
export type HttpTransport = (
  url: string,
  opts: { method: string; headers: Record<string, string> }
) => Promise<{ status: number; body: unknown }>;

// Plugin-internal

export interface MuesliSettings {
  apiKey: string;
  syncDirectory: string;                  // default 'Besprechungen'
  personFolder: string;                   // default 'Personen' ('' disables)
  allowedFolders: string[];               // default []
  earliestCreationDate: string | null;    // YYYY-MM-DD or null
  documentSyncLimit: number;              // default 0 = unlimited
  periodicIntervalMinutes: number;        // default 0 = off; clamped [0, 1440]
  skipExistingNotes: boolean;             // default false
  filenameTemplate: string;              // default '{date} {title}'
  filenameDateFormat: string;             // default 'DD.MM.YYYY'
  includeMyNotesPlaceholder: boolean;     // default true
  includeEnhancedNotes: boolean;          // default true
  includeTranscript: boolean;             // default true
  bodyDateFormat: 'local' | 'iso';        // default 'local'
  bodyTimeZone: 'local' | 'utc';          // default 'local'
  myName: string;                         // default ''
  attendeeTagTemplate: string;            // default 'person/{name}'
  additionalFrontmatter: string;          // multi-line "key: value", '' = none
}

export interface MuesliState {
  lastSyncAt: string | null;                            // ISO timestamp
  filteredOut: Record<GranolaNoteId, string>;           // id → updated_at
  lastSyncReport: SyncReport | null;
}

// Root shape of data.json
export interface PluginData {
  settings: MuesliSettings;
  state: MuesliState;
}

export interface SyncReport {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  listed: number;
  created: number;
  updated: number;
  unchanged: number;
  filteredOut: number;
  delisted: number;
  skippedExisting: number;
  stillProcessing: number;
  errors: Array<{ id: GranolaNoteId; reason: string }>;
  unmatchedAttendees: Array<{ name: string; sourceNoteTitles: string[] }>;  // deduplicated by name
  aborted: 'api_unhealthy' | 'network' | 'list_failed' | null;
}

export interface DiffResult {
  toCreate: GranolaNoteId[];
  toUpdate: GranolaNoteId[];
  unchanged: GranolaNoteId[];
  filteredOut: GranolaNoteId[];
  delisted: GranolaNoteId[];
  newFilteredOutCache: Record<GranolaNoteId, string>;
}
```

`VaultIndexEntry` and `AttendeeIndex` live in their respective modules:

```ts
// src/vault.ts
import type { TFile } from 'obsidian';
import type { GranolaNoteId } from './types';

export interface VaultIndexEntry { file: TFile; granolaUpdatedAt: string; }
export type VaultIndex = Record<GranolaNoteId, VaultIndexEntry>;

// src/attendees.ts
// normalizedName (trimmed, collapsed spaces, lower-cased) → vault filename
export type AttendeeIndex = Record<string, string>;
```

## API Contracts

### `GranolaClient` (`src/granola.ts`)

```ts
export class GranolaClient {
  constructor(
    private readonly apiKey: string,
    private readonly transport: HttpTransport   // injected; defaults to fetch adapter in CLI, requestUrl adapter in plugin
  ) {}

  async listNotes(params: { createdAfter?: string; cursor?: string }): Promise<ListResponse>;
  async listAllNotes(params: { createdAfter?: string }): AsyncGenerator<Note>;
  async getNote(id: GranolaNoteId, opts: { includeTranscript: boolean }): Promise<NoteWithBody | null>;
}
```

- Base URL: `https://public-api.granola.ai/v1` (hardcoded; user input never reaches `requestUrl` or `fetch`).
- Auth header: `Authorization: Bearer <apiKey>` — never logged.
- The plugin adapter passes `{ throw: false }` to Obsidian's `requestUrl`; 4xx/5xx come back as status codes. It reads `response.json` as a data property (not a method call) and maps it to `{ status, body }`.
- 429 → retry 3× with delays 250 ms / 500 ms / 1000 ms; final 429 → throw per-call error.
- 401 → throw `new Error('InvalidApiKey')` immediately, no retries.
- 404 → return `null` (only from `getNote`; 404 on list endpoints throws `GranolaHttpError`).
- Other 4xx/5xx → throw `new GranolaHttpError(status)` with status code in message.
- `syncAll` must not conflate a thrown `GranolaHttpError` with a `null` return.

### `renderMeeting` (`src/markdown.ts`)

```ts
export function renderMeeting(
  note: NoteWithBody,
  notesOnSpeakers: Record<string, string>,   // parsed from existing frontmatter by caller; {} when creating
  settings: MuesliSettings,
  attendeeIndex: AttendeeIndex
): string;
```

Returns the full file content string (frontmatter + marker blocks). Does not stamp `additionalFrontmatter` — that is handled by `stampAdditionalFrontmatter` after merge. Does not perform I/O.

### `stampAdditionalFrontmatter` (`src/markdown.ts`)

```ts
export function stampAdditionalFrontmatter(
  content: string,
  additional: Record<string, string>,
  isCreation: boolean
): string;
```

When `isCreation` is false, returns `content` unchanged. When `isCreation` is true, merges `additional` into the frontmatter block, silently skipping (with `console.warn`) any key in the `granola_*` namespace or in the set `{ meeting_start, meeting_end, web_url, attendees, tags }`. `additional` is produced by parsing `settings.additionalFrontmatter` with `js-yaml.load` in a `try/catch`; on error, emits `console.warn` and uses `{}`.

### `mergeMeetingFile` (`src/merge.ts`)

```ts
export function mergeMeetingFile(existing: string, rendered: string): string;
```

Merges user-owned content (frontmatter keys not in the plugin-managed set, content outside marker blocks, tags outside the current namespace) from `existing` into `rendered`. Marker blocks present in `rendered` replace their counterparts in `existing`; marker blocks absent from `rendered` are preserved from `existing` verbatim. Returns the merged file string. Does not perform I/O.

### `diffNotes` (`src/sync.ts`)

```ts
export function diffNotes(
  vaultIndex: VaultIndex,
  listed: Note[],
  state: MuesliState,
  settings: MuesliSettings
): DiffResult;
```

Pure function. Receives the complete paginated list from `syncAll`. Applies filters in order: (a) `documentSyncLimit` cap (sort descending by `created_at`, keep top N; excluded IDs omitted from `filteredOut`), (b) `earliestCreationDate` floor (excluded IDs omitted from `filteredOut`), (c) `allowedFolders` allowlist with `filteredOut` cache. Categorises each listed note into one DiffResult bucket.

### `syncAll` (`src/sync.ts`)

```ts
export async function syncAll(
  app: App,
  settings: MuesliSettings,
  state: MuesliState,
  client: GranolaClient,
  onProgress?: (n: number, total: number) => void
): Promise<SyncReport>;
```

Orchestrates: fetch all list pages → `buildVaultIndex` → `diffNotes` → per-note `getNote` + render + merge + write → persist updated `state` + `SyncReport` to `data.json`.

### `buildVaultIndex` (`src/vault.ts`)

```ts
export function buildVaultIndex(app: App, settings: MuesliSettings): VaultIndex;
```

Iterates `app.vault.getMarkdownFiles()`, filters by `settings.syncDirectory` path prefix, calls `app.metadataCache.getFileCache(file)` per file. Skips files where `getFileCache` returns `null` or where `frontmatter?.granola_id` fails a `typeof v === 'string'` guard. Iterates files sorted ascending by `file.path`; on duplicate `granola_id` the first wins and a `console.warn` is emitted.

### `buildAttendeeIndex` (`src/attendees.ts`)

```ts
export function buildAttendeeIndex(app: App, settings: MuesliSettings): AttendeeIndex;
```

Scans only `settings.personFolder`. For each file matching the pattern `Person - {First Last}.md`, adds an entry keyed by the normalized name (trimmed, spaces collapsed, lower-cased) mapping to the vault filename.

### `filenameFor` (`src/vault.ts`)

```ts
export function filenameFor(
  note: NoteWithBody,
  settings: MuesliSettings,
  existingFilenames: Set<string>
): string;
```

Resolves template placeholders (`{date}`, `{created_date}`, `{updated_date}`, `{title}`, `{id}`), applies date format via `formatDate` from `src/markdown.ts`, sanitizes forbidden characters (`/\:*?"<>|` → `-`), truncates stem to 200 characters, appends `.md`. Falls back to `"Untitled"` when `note.title` is null. If the resulting filename is in `existingFilenames`, appends ` {full GranolaNoteId}` before `.md`.

## Configuration

| Source | Name | Type | Default | Required | Notes |
|---|---|---|---|---|---|
| Env (dev) | `OBSIDIAN_PLUGIN_TARGET` | path | — | yes for `make install` | Path to test vault's `.obsidian/plugins/` |
| Env (CLI) | `GRANOLA_API_KEY` | string | — | yes for CLI use | Bearer key, `grn_*` prefix |
| `data.json` | `settings` | `MuesliSettings` | see Data Models | API key required | All other settings have defaults |
| `data.json` | `state` | `MuesliState` | see Data Models | no | Persisted automatically |

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Invalid API key | HTTP 401 from any endpoint | Abort sync immediately; no retries; throw `InvalidApiKey` | Notice: "Müslidian: Invalid API key"; status bar shows `error` |
| Network unreachable | `requestUrl` / `fetch` rejects with network error | Abort sync; `aborted: 'network'` in report | Notice with reason; status bar shows `error` |
| Rate limit (recoverable) | HTTP 429; resolved within 3 retries | Continue normally | Silent |
| Rate limit (exhausted) | HTTP 429 after 3 retries | Per-note error; sync continues | Aggregated in sync report |
| Note still processing | HTTP 404 on `getNote` | Skip; count as `stillProcessing` | Aggregated in report; no mid-sync Notice |
| Transient per-note 5xx | HTTP 5xx on `getNote` | Per-note error recorded; sync continues | Aggregated in report |
| Circuit breaker | 5 consecutive non-404 errors from `getNote` | Abort with `aborted: 'api_unhealthy'`; partial progress preserved | Notice with reason; status bar shows `error` |
| `listNotes` first-page failure | First page of list fails for any reason | Abort with `aborted: 'list_failed'` | Notice with reason |
| Filesystem write error | Vault adapter write throws | Per-note error; sync continues | Aggregated in report |
| Duplicate `granola_id` in vault | Two files share the same `granola_id` | `buildVaultIndex` picks first by ascending `file.path`; second is skipped | `console.warn` (not surfaced in UI) |
| QuickAdd absent or `.api` falsy | Click on unmatched attendee in report modal | Create stub at `<personFolder>/Person - {sanitized name}.md` with `person_tag`, `note_type: person_note`, `tags: [Person]` | Notice: "Created stub at …" |
| Concurrent sync invocation | Any trigger while a sync is in flight | Return immediately; do not queue | Notice: "Müslidian sync already running" |
| Malformed marker block (no `:end`) | `<!-- granola:*:start -->` without matching `:end` | Overwrite from start tag to next `<!-- granola:*:start -->` or EOF | None |
| `additionalFrontmatter` parse error | `js-yaml.load` throws on the stored string | Emit `console.warn`; treat as empty; no keys stamped | None |
| `periodicIntervalMinutes` out of range in `data.json` | Plugin load reads value outside [0, 1440] | Clamp silently; emit `console.warn` | None |
| Unsafe `personFolder` or `syncDirectory` | Path contains `..` or resolves outside vault root | Revert to previous value; show inline warning in settings tab | Inline settings warning |
| `additionalFrontmatter` key collision | Key matches `granola_*` namespace or managed key set | Skip that key | `console.warn` |

## Implementation Phases

## Phase 1 — Foundation: types, API client, CLI

Scaffold the entire project structure (no Obsidian-visible behavior yet). `src/main.ts` declares an empty Plugin class only. All verification happens via the CLI and Vitest tests against fixtures.

**Deliverables:**
- `manifest.json`, `package.json` (with `js-yaml`, `@types/js-yaml`, `typescript`, `esbuild`, `vitest`, `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `obsidian` as devDependencies), `tsconfig.json`, `esbuild.config.mjs`, `versions.json`
- `Makefile` with targets: `help`, `setup` (`npm ci`), `doctor` (node/npm version check), `build` (esbuild both outputs), `watch`, `install` (copy to `OBSIDIAN_PLUGIN_TARGET`), `check` (`tsc --noEmit && eslint && vitest run`)
- `.eslintrc.cjs` (ESLint + `@typescript-eslint`, strict mode)
- `.gitignore`, `.env.example`
- `src/types.ts` — all types from §Data Models
- `src/granola.ts` — `GranolaClient` with injected transport, retries, 404→null, pagination
- `bin/mueslidian.ts` — CLI entry; uses `util.parseArgs` (Node 18+); transport: native `fetch` adapter producing `{ status, body }` from `response.json()`
- `tests/__mocks__/obsidian.ts` — manual mock (scaffold; used from Phase 2 onward)
- `tests/fixtures/` — `list-page-1.json`, `list-page-2.json`, `note-with-transcript.json`, `note-no-calendar.json`, `note-still-processing.404.json`
- `tests/granola.test.ts`

**Phase complete when:**
- `make setup && make build` succeeds.
- `make check` (typecheck + lint + test) is green.
- CLI `node dist/mueslidian.js test` against a real `GRANOLA_API_KEY` prints `OK (N notes)`.
- All test scenarios below pass.

### Test Scenarios

- **TS1.1 — Happy path list**
  - GIVEN fixture `list-page-1.json` with `hasMore: false`
  - WHEN `listAllNotes({})` is iterated via a spy transport
  - THEN it yields all notes in the fixture and makes exactly one HTTP call.
- **TS1.2 — Pagination**
  - GIVEN fixtures `list-page-1.json` (`hasMore: true, cursor: 'c'`) and `list-page-2.json` (`hasMore: false`)
  - WHEN `listAllNotes({})` is iterated
  - THEN all notes from both pages are yielded; the second HTTP call carries `cursor=c`.
- **TS1.3 — 429 retry**
  - GIVEN spy transport returns `{ status: 429, body: {} }` twice then `{ status: 200, body: <fixture> }` for `listNotes`
  - WHEN `listNotes({})` is awaited
  - THEN the call succeeds on the third attempt; the spy records exactly three calls.
- **TS1.4 — 404 returns null**
  - GIVEN spy transport returns `{ status: 404, body: {} }` for `getNote('not_x')`
  - WHEN `getNote('not_x', { includeTranscript: true })` is awaited
  - THEN the return value is `null` and no exception is thrown.
- **TS1.5 — 401 throws InvalidApiKey**
  - GIVEN spy transport returns `{ status: 401, body: {} }` for any call
  - WHEN any client method is awaited
  - THEN it throws with message `'InvalidApiKey'`; the spy records exactly one call (no retries).
- **TS1.6 — CLI test command success**
  - GIVEN `GRANOLA_API_KEY=grn_x` in env and a stub transport returning 1 note
  - WHEN `node dist/mueslidian.js test` runs
  - THEN stdout contains `OK (1 note)` and exit code is 0.
- **TS1.7 — CLI missing key**
  - GIVEN no `GRANOLA_API_KEY` in env
  - WHEN `node dist/mueslidian.js test` runs
  - THEN stderr contains "GRANOLA_API_KEY" and exit code is non-zero.
- **TS1.8 — API key not leaked**
  - GIVEN all `console.*` outputs captured while running every CLI subcommand against fixtures
  - WHEN the captured strings are searched for the literal API key value
  - THEN no match is found.

## Phase 2 — File contract: render, merge, on-demand command

Implement all pure file-contract logic and wire one on-demand command. No periodic timer, no `syncAll` yet.

**Deliverables:**
- `src/markdown.ts` — `renderMeeting`, `renderFrontmatter`, `renderMetaCallout`, `renderEnhanced`, `renderTranscript` (module-internal helpers), `stampAdditionalFrontmatter` (exported), `formatDate` (exported pure helper)
- `src/merge.ts` — `splitFrontmatter`, `replaceMarkerBlock`, `mergeMeetingFile` (all pure)
- `src/vault.ts` — `filenameFor`, `findExistingByGranolaId`, `ensureFolder`, `buildVaultIndex`
- `src/attendees.ts` — `AttendeeIndex` type, `buildAttendeeIndex`, `matchAttendee`, `generateTag`, `shouldExcludeSelf`
- `src/settings.ts` — `MuesliSettings` defaults, settings tab UI (Obsidian `PluginSettingTab`); `normalizePath` validation for `personFolder` and `syncDirectory`; API key format warning
- `src/main.ts` — Plugin class registers "Müslidian: Test connection", "Müslidian: Sync meeting by ID or URL" (ID extracted via `/not_[a-zA-Z0-9]{14}/`), and the settings tab
- `tests/__mocks__/obsidian.ts` — complete manual mock for `Notice`, `Modal`, `TFile`, `App`, `PluginSettingTab`, `normalizePath`
- `tests/markdown.test.ts`, `tests/merge.test.ts`, `tests/vault.test.ts`, `tests/attendees.test.ts`

**Phase complete when:**
- "Müslidian: Sync meeting by ID or URL" works end-to-end against a real Granola note ID and writes a single file in the test vault.
- Settings tab persists all fields across plugin reload.
- Running the on-demand command twice on the same ID with no Granola-side changes produces byte-identical files (SHA-256 hash unchanged).
- `MuesliSettings` defaults round-trip through JSON serialization without mutation (unit test).
- All test scenarios below pass.

### Test Scenarios

- **TS2.1 — Render new file structure**
  - GIVEN fixture `note-with-transcript.json` and default settings, `notesOnSpeakers = {}`
  - WHEN `renderMeeting(fixture, {}, settings, attendeeIndex)` is called
  - THEN the output contains, in order: YAML frontmatter block, `<!-- granola:meta:start -->` … `<!-- granola:meta:end -->`, `<!-- granola:enhanced:start -->` … `<!-- granola:enhanced:end -->`, `## My Notes`, `<!-- granola:transcript:start -->` … `<!-- granola:transcript:end -->`.
- **TS2.2 — Merge preserves user content**
  - GIVEN existing file with `## My Notes\n\nUser text\n` between the enhanced-end and transcript-start markers AND frontmatter key `priority: high`
  - WHEN `mergeMeetingFile(existing, renderMeeting(fixture, {}, settings, attendeeIndex))` is called
  - THEN the result contains `priority: high` and "User text"; marker block contents reflect the new fixture data.
- **TS2.3 — Disabled block not destroyed**
  - GIVEN existing file with all three marker blocks AND settings with `includeTranscript: false`
  - WHEN `renderMeeting` is called then `mergeMeetingFile` merges
  - THEN the existing transcript block is present and unchanged; meta and enhanced blocks are updated.
- **TS2.4 — Calendar-null edge**
  - GIVEN fixture `note-no-calendar.json` (`calendar_event: null`, `attendees: []`)
  - WHEN `renderMeeting` runs
  - THEN frontmatter omits `meeting_start`, `meeting_end`, `invitees`, `unscheduled_attendees`, `event_title`, `organiser`; meta callout omits the corresponding lines.
- **TS2.5 — Matched attendee → tag + wikilink**
  - GIVEN `attendeeIndex` containing `"eve evans"` → `"Person - Eve Evans.md"`, fixture with attendee `{ name: "Eve Evans" }`
  - WHEN `renderMeeting` runs
  - THEN frontmatter `tags` includes `person/Eve_Evans`; meta callout contains `[[Person - Eve Evans|Eve Evans]]`.
- **TS2.6 — Self-exclusion**
  - GIVEN `settings.myName = "Sam Sample"` AND fixture with attendee `{ name: "Sam Sample" }`
  - WHEN `renderMeeting` runs
  - THEN `tags` does NOT contain `person/Sam_Sample`; attendee still appears in `attendees` frontmatter array and in the meta callout.
- **TS2.7 — Tag namespace ownership: stale tag removed**
  - GIVEN existing `tags: [meeting, granola, person/Old_Person, custom]`, fixture with attendee "Eve Evans", no "Old Person" attendee, template `person/{name}`
  - WHEN `renderMeeting` + `mergeMeetingFile` runs
  - THEN resulting `tags` is `[meeting, granola, custom, person/Eve_Evans]`.
- **TS2.8 — Tags from prior namespace preserved**
  - GIVEN existing `tags: [people/Friend_Example]` (legacy `people/{name}` prefix) AND current template `person/{name}`
  - WHEN `renderMeeting` + `mergeMeetingFile` runs
  - THEN `people/Friend_Example` is retained.
- **TS2.9 — Filename template**
  - GIVEN `filenameTemplate: '{date} {title}'`, `filenameDateFormat: 'DD.MM.YYYY'`, note with `scheduled_start_time: '2026-01-27T10:00:00Z'`, title `"Q1 Review"`, `existingFilenames: new Set()`
  - WHEN `filenameFor(note, settings, new Set())` is called
  - THEN it returns `"27.01.2026 Q1 Review.md"`.
- **TS2.9b — Null title fallback**
  - GIVEN note with `title: null`, `existingFilenames: new Set()`
  - WHEN `filenameFor(note, settings, new Set())` is called
  - THEN the filename uses `"Untitled"` as the title token.
- **TS2.10 — Filename sanitization**
  - GIVEN a title containing `/\:*?"<>|`
  - WHEN `filenameFor` runs
  - THEN those characters are replaced with `-`; the result (without `.md`) is ≤ 200 characters.
- **TS2.11 — Idempotent on-demand**
  - GIVEN the on-demand command was run once on `not_x` producing file F
  - WHEN run a second time on `not_x` with no Granola-side changes
  - THEN F is byte-identical (SHA-256 hash unchanged). (Timestamps come from API, not `Date.now()`.)
- **TS2.12 — Additional frontmatter stamped on creation only**
  - GIVEN `additionalFrontmatter: "type: meeting"` and a new on-demand sync, then the setting changed to `"type: notes"`, then a second on-demand sync on the same ID
  - WHEN comparing file states
  - THEN the first sync wrote `type: meeting`; the second sync left it unchanged.
- **TS2.13 — Transcript labels with notes_on_speakers remap**
  - GIVEN fixture with one `microphone` turn (owner name "Oat", `start_time: "0"`) and one `speaker` turn (`diarization_label: "Speaker A"`, `start_time: "12"`), and existing frontmatter `notes_on_speakers: { "Speaker A": "Alice" }` parsed by the caller into `{ "Speaker A": "Alice" }`
  - WHEN `renderMeeting(note, { "Speaker A": "Alice" }, settings, {})` is called
  - THEN the turn headings are `**Oat (00:00):**` and `**Alice (00:12):**`.
- **TS2.14 — additionalFrontmatter collision skipped**
  - GIVEN `additionalFrontmatter: "granola_id: injected\ntype: meeting"` and `isCreation: true`
  - WHEN `stampAdditionalFrontmatter` runs
  - THEN `granola_id` is skipped (console.warn emitted); `type: meeting` is present in the output frontmatter.

## Phase 3 — Sync orchestration: full sync, filtering, cache

Implement `sync.ts` and wire "Müslidian: Sync now". Share the in-flight lock with the on-demand command from Phase 2.

**Deliverables:**
- `src/sync.ts` — `diffNotes` (pure), `syncAll`, report generation, filtered-out cache lifecycle, delisting detection, circuit-breaker
- Updated `src/main.ts` — registers "Müslidian: Sync now"; settings tab actions `[Sync now]`, `[View last sync report]`, `[Clear filtered-out cache]` (with confirmation dialog)
- `tests/sync.test.ts`

**Phase complete when:**
- A fresh sync against a curated allowed set populates the expected files.
- A consecutive sync with warm cache and no Granola changes produces zero file writes and zero `getNote` calls.
- All test scenarios below pass.

### Test Scenarios

- **TS3.1 — Fresh sync creates files**
  - GIVEN empty sync directory, 3 fixture notes, empty allowlist, default settings
  - WHEN `syncAll` runs
  - THEN 3 files are created; report is `{ created: 3, updated: 0, unchanged: 0, errors: [] }`.
- **TS3.2 — Idempotent re-sync (warm cache)**
  - GIVEN vault state from TS3.1 (warm cache, no cache clear), spy transport call counter reset
  - WHEN `syncAll` runs again with no Granola changes
  - THEN 0 files are written; 0 `getNote` spy calls are recorded; report is `{ created: 0, updated: 0, unchanged: 3 }`.
- **TS3.3 — Updated note triggers fetch + write**
  - GIVEN vault from TS3.1 AND one fixture's `updated_at` is advanced and `summary_markdown` changed
  - WHEN `syncAll` runs
  - THEN exactly one file is rewritten; report includes `{ updated: 1 }`.
- **TS3.4 — Folder allowlist filtering**
  - GIVEN allowlist `["Reviewed"]`, 2 fixture notes in "Reviewed", 1 in "Drafts", 1 with empty `folder_membership`
  - WHEN `syncAll` runs
  - THEN 2 files are created; `filteredOut` cache contains the 2 non-matching IDs (1 in "Drafts" + 1 with empty membership); report is `{ created: 2, filteredOut: 2 }`.
- **TS3.5 — Filtered-out cache stays warm**
  - GIVEN state from TS3.4, spy transport call counter reset
  - WHEN `syncAll` runs again
  - THEN 0 `getNote` spy calls occur for the cached filtered IDs; report includes `{ unchanged: 2, filteredOut: 2 }`.
- **TS3.6 — Cache invalidated on updated_at advance**
  - GIVEN `filteredOut` cache contains `not_x` with `updated_at: T1`; list returns `not_x` with `updated_at: T2 > T1`
  - WHEN `syncAll` runs
  - THEN `getNote('not_x')` IS called; folder membership is re-checked.
- **TS3.7 — Clear cache forces refetch**
  - GIVEN state from TS3.4
  - WHEN `[Clear filtered-out cache]` is confirmed AND `syncAll` runs
  - THEN `getNote` is called for the previously-filtered IDs; `filteredOut` cache is repopulated.
- **TS3.8 — Date floor**
  - GIVEN `earliestCreationDate: '2026-01-01'`, fixture with `created_at: '2025-12-15'` and fixture with `created_at: '2026-01-15'`
  - WHEN `diffNotes` runs
  - THEN only the 2026-01-15 note appears in `toCreate`; the 2025-12-15 ID is NOT in `filteredOut` or `toCreate`.
- **TS3.9 — Document sync limit**
  - GIVEN `documentSyncLimit: 2` and 5 fixture notes sorted descending by `created_at`
  - WHEN `diffNotes` runs
  - THEN only the top 2 appear in `toCreate`; the other 3 IDs are NOT in `filteredOut`.
- **TS3.10 — Delisting**
  - GIVEN an existing synced file for `not_x` AND `not_x` is now in a non-allowed folder
  - WHEN `syncAll` runs
  - THEN the file remains on disk; report includes `{ delisted: 1 }`.
- **TS3.11 — Still-processing skip**
  - GIVEN spy transport returns `{ status: 404, body: {} }` for `getNote('not_x')`
  - WHEN `syncAll` processes `not_x`
  - THEN no file is written; report is `{ stillProcessing: 1 }`; `errors` is empty.
- **TS3.12 — Circuit breaker**
  - GIVEN spy transport returns `{ status: 500, body: {} }` for 5 consecutive `getNote` calls
  - WHEN `syncAll` processes them
  - THEN sync aborts after the 5th; report is `{ aborted: 'api_unhealthy' }`; any files written before the abort are preserved.
- **TS3.13 — Lock prevents re-entry**
  - GIVEN a `syncAll` call that is paused mid-run via a deferred promise injected through `onProgress`
  - WHEN a second sync trigger arrives while the first is paused
  - THEN the second invocation returns immediately; a `Notice` containing `"already running"` is captured by the mock; the deferred promise is then resolved and the first sync completes normally.
- **TS3.14 — On-demand bypasses filters**
  - GIVEN `not_x` lives in a non-allowed folder
  - WHEN "Müslidian: Sync meeting by ID or URL" is invoked with `not_x`
  - THEN the note is fetched, a file is written, and a `Notice` references the allowlist bypass.

## Phase 4 — Periodic, status bar, QuickAdd, README

Add runtime timer, status bar, and the unmatched-attendee QuickAdd flow. README is the final deliverable.

**Deliverables:**
- Updated `src/main.ts`:
  - `setInterval`-based periodic driver using an injectable scheduler (`schedulerFn: typeof setInterval`) for testability
  - `shouldCatchUp(lastSyncAt: string | null, intervalMinutes: number, nowMs: number): boolean` exported pure function
  - Catch-up logic on plugin load: fires `syncAll` after `delayFn(60_000)` if `shouldCatchUp` returns true; `delayFn` defaults to `(ms) => new Promise(r => setTimeout(r, ms))` and is injectable for tests
  - Status-bar item: text updated each sync and every 30 s for idle relative-time display; click opens last report modal
  - Periodic interval reset when `periodicIntervalMinutes` is changed in settings
- Sync report modal showing all scalar `SyncReport` fields and a clickable unmatched-attendees list
- QuickAdd integration: detect `app.plugins.plugins['quickadd']?.api` at click time; invoke `api.executeChoice('Person', { name: attendeeName })` or fall back to stub creation
- `README.md` — install (BRAT + manual), settings walkthrough, file contract reference, security note (plain-text API key warning)
- Updated `tests/` for new pure functions (`shouldCatchUp`, relative-time formatter)

**Phase complete when:**
- A periodic interval of 1 minute fires automatic syncs while Obsidian is open.
- Reopening Obsidian after a long absence triggers a catch-up sync ~60 s later.
- Clicking an unmatched attendee invokes QuickAdd "Person" or falls back gracefully to stub creation.
- README is sufficient for a fresh install on a second machine.
- All test scenarios below pass.

### Test Scenarios

- **TS4.1 — shouldCatchUp pure function**
  - GIVEN `shouldCatchUp(lastSyncAt, intervalMinutes, nowMs)`
  - WHEN `lastSyncAt` is exactly `intervalMinutes` minutes before `nowMs` THEN it returns `true`.
  - WHEN `lastSyncAt` is within the interval THEN it returns `false`.
  - WHEN `intervalMinutes === 0` THEN it always returns `false`.
- **TS4.1b — Periodic timer fires (injectable scheduler)**
  - GIVEN an injectable scheduler and `periodicIntervalMinutes: 1`
  - WHEN the scheduler fires after 60 s of simulated elapsed time
  - THEN `syncAll` is called exactly once.
- **TS4.2 — Periodic silent on no-change**
  - GIVEN periodic sync completes with `{ created: 0, updated: 0, errors: [] }`
  - WHEN observing user-visible output
  - THEN no Notice fires; status bar updates silently.
- **TS4.3 — Interval reset on settings change**
  - GIVEN injectable scheduler, `periodicIntervalMinutes` changes from 5 to 2 at runtime
  - WHEN the new value is saved
  - THEN the prior interval is cancelled and a fresh interval starts from that moment.
- **TS4.4 — Status bar click → last report**
  - GIVEN a completed sync with a stored `SyncReport`
  - WHEN the status bar item is clicked
  - THEN the `Modal` mock's constructor is called with args reflecting the report's scalar fields.
- **TS4.5 — QuickAdd present integration**
  - GIVEN `app.plugins.plugins['quickadd'].api` is truthy AND `executeChoice` is a spy
  - WHEN an unmatched attendee row in the report modal is clicked
  - THEN `executeChoice('Person', { name: attendeeName })` is called exactly once.
- **TS4.6 — QuickAdd absent fallback**
  - GIVEN `app.plugins.plugins['quickadd']` is undefined AND unmatched attendee "Bob Smith" is clicked
  - WHEN the handler runs
  - THEN a file is created at `<personFolder>/Person - Bob Smith.md` with frontmatter containing `note_type: person_note`; the `Notice` mock is called with a string containing "Created stub".
- **TS4.7 — Skip-existing mode**
  - GIVEN `skipExistingNotes: true`, vault already contains a file for `not_x`, Granola's `not_x` has a changed `summary_markdown`
  - WHEN `syncAll` runs
  - THEN the file for `not_x` is byte-identical to its pre-run state; report is `{ skippedExisting: 1, updated: 0 }`.

## Decision Log

- **D1 (rejected)** — Single combined `granola:body` block. Three named blocks let users reorder them and toggle them independently without merge complications.
- **D2 (rejected)** — Store API key in macOS Keychain via `keytar`. Native module adds desktop-only build complexity; `data.json` with a README warning is acceptable for v1.
- **D3 (rejected)** — Mirror Granola's folder hierarchy into Obsidian folders. File moves on folder change, multi-folder membership ambiguity, lateral churn for a personal-tool v1. Folders exposed as `granola_folders` metadata only.
- **D4 (rejected)** — Auto-create Person notes silently for every unmatched attendee. Pollutes `Personen` with one-off attendees. Suggest-and-click keeps the user in control.
- **D5 (from refine F1)** — Idempotency guarantee qualified. NFR3 holds only with a warm filtered-out cache. After a cache clear, the next sync incurs one `getNote` per previously-filtered ID. Tests assert zero calls only when preceded by a warming sync.
- **D6 (from refine F2)** — QuickAdd is a soft runtime dependency. Detected at click-time via `app.plugins.plugins['quickadd']?.api`; absent QuickAdd falls back to stub Person note creation without breaking the plugin.
- **D7 (from refine F3)** — NFR2 (5-second steady state) is bounded to vaults of up to 500 notes against an API responding in under 2 s. Larger corpora degrade gracefully (no failures, longer syncs). TS3.2 verifies behavioral correctness (zero writes, zero fetches), not wall-clock time.
- **D8 (from refine F4)** — TS3.2 has an explicit precondition: preceded by a successful warming sync with no cache clear in between.
- **D9 (concreteness)** — "Template prefix" in FR19 means the literal substring before `/{name}` in `attendeeTagTemplate`. For default `person/{name}` the prefix is `person`. Tags matching `person/*` that do not correspond to a current attendee are removed; tags with any other prefix are user-owned and preserved.
- **D10** — `notes_on_speakers` lookup is exact-match, case-sensitive. `diarization_label` values from the API are machine-generated and stable per note; case-insensitive lookup invites ambiguity.
- **D11 (from findings-a)** — YAML library closed: `js-yaml` is the sole runtime dependency for frontmatter parsing. Added to `package.json` in Phase 1 scaffolding.
- **D12 (from findings-a)** — `GranolaClient` accepts an `HttpTransport` as a constructor parameter. This is the only mechanism for test spying on HTTP calls (`getNote` call counts in TS3.2, TS3.5, etc.).
- **D13 (from findings-a)** — `renderMeeting` / `mergeMeetingFile` boundary: `renderMeeting` omits disabled blocks from output; `mergeMeetingFile` preserves any existing block whose marker tag is absent from the rendered output. This resolves the FR9 vs TS2.3 apparent contradiction.
- **D14 (from findings-a)** — "Creation only" for `additionalFrontmatter` means first write of a file, regardless of which trigger (syncAll or on-demand) creates it.
- **D15 (from findings-b)** — `bodyDateFormat` / `bodyTimeZone` kept as two separate settings (matching the PRD §5.5 settings table exactly). YAGNI concern noted but the PRD explicitly lists both settings; removing either would drop a PRD requirement.
- **D16 (from findings-b)** — `SyncReport.unmatchedAttendees` is deduplicated by name; each entry carries an array of `sourceNoteTitles` to cap unbounded growth.
- **D17 (from findings-b)** — Phase 4 timer and QuickAdd are implemented in the same phase but as separate commits within the phase (timer → status bar → QuickAdd → README).
- **D18 (from validate A-F1)** — `HttpTransport` returns `Promise<{ status: number; body: unknown }>` where `body` is pre-parsed JSON. The plugin adapter uses Obsidian's `requestUrl` with `{ throw: false }` and reads `response.json` as a data property. The CLI adapter calls `response.json()` as a method and wraps the result in the same shape.
- **D19 (from validate A-F2)** — `getNote` null-vs-throw contract: only 404 returns `null`; 401 throws `InvalidApiKey`; all other non-2xx throw `GranolaHttpError`. `syncAll` uses a type check on the return value and does not conflate thrown errors with `null`.
- **D20 (from validate A-F3)** — QuickAdd invocation uses `app.plugins.plugins['quickadd'].api.executeChoice('Person', { name: attendeeName })`. Fallback to stub creation activates when `app.plugins.plugins['quickadd']?.api` is falsy.
- **D21 (from validate B-F6)** — Obsidian UI primitives (`Notice`, `Modal`) are mocked via `vi.mock('obsidian')` with a manual mock at `tests/__mocks__/obsidian.ts`. No per-function notify callback is introduced.
- **D22 (from findings-b quality)** — `renderMeeting` does not branch on `existing` for `additionalFrontmatter`; a separate `stampAdditionalFrontmatter` function receives an explicit `isCreation` boolean. This resolves the SRP concern.
- **D23 (from findings-b quality)** — TS3.13 lock test uses an `onProgress` deferred-promise hook to pause `syncAll` mid-run deterministically, avoiding a real `setTimeout`.
- **D24 (from validate B-F4)** — `personFolder` and `syncDirectory` are validated through `normalizePath()` at settings-load time; unsafe paths revert with an inline warning. Stub Person-note filenames use `filenameFor` sanitization on the attendee name.

## Open Decisions

None.

## Unresolved Gaps

None. All findings from findings_a, findings_b, and validate_findings were resolved by adding concrete decisions to the Decision Log or by inlining specifications into requirements, API contracts, or test scenarios.

## Out of Scope

- Bidirectional sync (PRD N1).
- Mobile / iOS / Android (PRD N2).
- Multiple Granola accounts (PRD N4).
- Mirroring Granola's folder hierarchy into Obsidian folders (PRD N5).
- Editing Granola content from inside Obsidian (PRD N6).
- Ingesting Granola's local desktop data (PRD N7).
- Backfilling user-typed Granola notes (PRD N8).
- Public Community Plugin directory submission (PRD N9).
- Automatic cleanup of stale attendee tags after template change (PRD F9).
- macOS Keychain storage for the API key (PRD F10).
- Auto-rename of files when meeting title changes in Granola.
- Speaker remapping UI beyond per-note `notes_on_speakers` (PRD F5).
