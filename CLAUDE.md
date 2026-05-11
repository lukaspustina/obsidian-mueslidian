# Müslidian

Obsidian plugin that syncs meetings from Granola (https://granola.ai) into
the vault as markdown files, preserving user annotations across re-syncs.
The plugin's user-facing name is **Müslidian**; its plugin id is `mueslidian`. The
repo dir is still `obsidian-granola-meetings`.

Follows global conventions from `~/.claude/` — KISS/YAGNI, conventional
commits without `Co-Authored-By`, surgical changes, no speculative scope.

## Stack

- TypeScript; no runtime deps beyond Obsidian's type definitions.
- esbuild for bundling.
- HTTP via Obsidian's `requestUrl` (CORS-safe inside the plugin); native
  `fetch` in the CLI.
- Node 18+ for the CLI (uses `parseArgs`).
- Vitest for tests.

## Architecture

Three layers sharing one API client:

- `src/granola.ts` — typed Granola API client. Used by both the plugin
  and the CLI.
- `src/main.ts` + plugin modules — Obsidian-side: commands, settings,
  sync orchestration, vault I/O, Person-note matching.
- `bin/mueslidian.ts` — standalone CLI for testing the API outside Obsidian.

One-way: Granola → Obsidian. No write-back to the API.

## File contract for synced meeting notes

Each meeting maps to one markdown file. The plugin owns:

- All `granola_*` frontmatter keys (`granola_id`, `granola_updated_at`,
  `granola_synced_at`, `granola_folders`).
- API-derived frontmatter keys: `title`, `event_title`, `date`,
  `meeting_start`/`meeting_end`, `owner_name`/`owner_email`, `organiser`,
  `attendees`, `invitees`, `unscheduled_attendees`, `calendar_event_id`,
  `web_url`.
- The `person/*` namespace within `tags` (added when an attendee matches
  a Person note; removed on next sync if no longer present).
- Body content between `<!-- granola:meta:start -->` …
  `<!-- granola:meta:end -->`, `<!-- granola:enhanced:start -->` …
  `<!-- granola:enhanced:end -->`, and
  `<!-- granola:transcript:start -->` …
  `<!-- granola:transcript:end -->`.

Everything else is user-owned and never touched: any other frontmatter
key (including `notes_on_speakers`), user-added tags outside the
`person/*` namespace, all content outside marker blocks (including
`## My Notes`).

Filename: configurable template (default `{date} {title}`) with
placeholders `{date}`, `{created_date}`, `{updated_date}`, `{title}`,
`{id}`. Date tokens rendered via a separate "Date format (filenames)"
setting. Filename is set on creation only — never auto-renamed.

The `granola_*` prefix is the plugin's namespace inside frontmatter even
though the plugin is called Müslidian. Reason: those keys map to Granola
data; keeping the prefix tied to the data source (not the plugin)
survives a future plugin rename.

## Dev workflow

- `.env` at repo root (gitignored) sets `OBSIDIAN_PLUGIN_TARGET` — path
  to the test vault's `.obsidian/plugins/`.
- `make watch` runs esbuild in watch mode, writing to `./dist/`.
- `make install` symlinks `<vault>/.obsidian/plugins/mueslidian → ./dist`.
  Refuses to overwrite a non-symlink.
- Install the "Hot Reload" community plugin in the test vault for
  automatic plugin reloads.
- **Develop against a separate test vault until Phase 2 verification
  passes.** The production vault at `/Users/lukas/Documents/Obsidian/Lu`
  has 120+ active Person notes — a merge bug could damage real data.
- Production Person folder (configurable in plugin settings):
  `/Users/lukas/Documents/Obsidian/Lu/Personen/`. Filenames follow
  `Person - {First} {Last}.md`; `person_tag` is derivable from filename
  for notes that lack the frontmatter key.

## Development practice

Strict TDD with the Red → Green → Refactor cycle:

1. **Red** — write a failing test that captures the next slice of
   behaviour. Run it and confirm it fails for the *right* reason.
2. **Green** — write the minimum code to make the test pass. No extra
   features, no speculative branches, no premature abstraction.
3. **Refactor** — clean the implementation up while tests stay green.
   No behaviour change in a refactor step.

Concretely for this project:

- **Pure functions first.** `render*`, `merge*`, `filenameFor`,
  frontmatter parsing — all pure and exhaustively tested. The plugin and
  sync layers wrap them.
- **Mock only at process boundaries.** Mock HTTP (the Granola API) and
  the Obsidian `App` (vault, metadataCache). Never mock our own modules.
- **Fixtures in `tests/fixtures/`** are JSON files captured from real
  API responses (scrubbed of private content). Tests reference fixtures
  by name.
- **Per-phase discipline**: each phase ends with new tests green and all
  prior tests still green. No phase commit ships with pending or skipped
  tests unless the SDD explicitly marks the item deferred.
- **Bug fixes**: write a failing test that reproduces the bug *first*,
  then fix.

## API constraints

- Base URL: `https://public-api.granola.ai/v1`. Bearer auth; keys
  prefixed `grn_`.
- Rate limits: 5 req/s sustained, 25 burst per 5s. Client retries 429
  with exponential backoff.
- The list endpoint returns metadata only — `folder_membership` is only
  on `GET /notes/{id}`. Folder-allowlist filtering therefore requires
  per-note fetches, cached in `data.json` under `filtered_out`.
- 404 from `GET /notes/{id}` means the note is still processing; skip
  and retry next sync (do not treat as an error).
- No webhooks; sync is poll-driven.

## Security

- API key lives in `<vault>/.obsidian/plugins/mueslidian/data.json`, plain
  text by Obsidian convention.
- **Never log the API key.** No `console.log(settings)` or
  `console.log(headers)` paths. Redact `Authorization` headers in any
  diagnostic output.
- README instructs users to gitignore the plugin's `data.json` if their
  vault is in a Git repo.

## Distribution

- Private GitHub repo; BRAT-distributed (BRAT requires a personal access
  token for private sources).
- Versioned per semver; `manifest.json`, `package.json`, and
  `versions.json` must agree (`make release-check` enforces).

## References

- Granola API docs: https://docs.granola.ai/introduction
- PRD: `specs/prd/mueslidian.md`
- PRD refine findings: `specs/prd/mueslidian.refine-findings.md`
- SDD: `specs/sdd/mueslidian.md` (to be generated via `/sdd`)
