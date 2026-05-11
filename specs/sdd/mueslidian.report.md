# SDD Implementation Report: mueslidian.md

**Date**: 2026-05-11
**Phases run**: 1, 2, 3, 4 — **all shipped**
**Overall status**: all-shipped (with documented Phase 4 wiring deferrals)
**SDD amendments suggested**: 11 (3 each from Phases 1–3, 2 from Phase 4 — all advisory)

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 1 | Foundation: types, API client, CLI | shipped | 957d6b2 |
| 2 | File contract: render, merge, vault, attendees | shipped | c6ae483 |
| 3 | Sync orchestration: syncAll, diffNotes, cache | shipped | b683e41 |
| 4 | Periodic, status bar, QuickAdd, skip-existing | shipped | fa61453 (+ tsc fix f777d85) |

**Test totals**: 72/72 tests across 45 files, all green.

## Phase 4: Periodic, status bar, QuickAdd, skip-existing

**Status**: shipped
**Commit**: `fa61453` (+ `f777d85` follow-up tsc fix)

### Acceptance Criteria

All 8 Phase 4 test scenarios pass.

| # | Criterion | Tests | Status |
|---|-----------|-------|--------|
| 1 | TS4.1 — shouldCatchUp pure | `p4_c1_shouldCatchUp.test.ts` | passing |
| 2 | TS4.1b — Periodic timer fires | `p4_c2_periodic_timer_fires.test.ts` | passing (orchestrator fix: `toHaveBeenCalledExactlyOnceWith` → `toHaveBeenCalledOnce`) |
| 3 | TS4.2 — Periodic silent on no-change | `p4_c3_periodic_silent.test.ts` | passing |
| 4 | TS4.3 — Interval reset on settings change | `p4_c4_interval_reset.test.ts` | passing |
| 5 | TS4.4 — Status bar click → last report | `p4_c5_status_bar_click_report.test.ts` | passing |
| 6 | TS4.5 — QuickAdd present integration | `p4_c6_quickadd_present.test.ts` | passing |
| 7 | TS4.6 — QuickAdd absent fallback | `p4_c7_quickadd_absent_fallback.test.ts` | passing |
| 8 | TS4.7 — Skip-existing mode | `p4_c8_skip_existing.test.ts` | passing |

### Reviewer Findings

**Blockers**: 0 — PASS.

**SDD Amendments Needed** (advisory):
- **A1: `tsc --noEmit` errors in `src/main.ts`** — `Modal` super call typed `unknown`, `typeof this.state` in nested annotation. Fixed in follow-up commit `f777d85` (proper `App` type + `MuesliPluginState` extracted to a type alias). `src/main.ts` is now tsc-clean.
- **A2: `SyncReportModal.report` field stored but never read** — dead until `onOpen` actually renders. YAGNI; drop or comment-mark.

**Deferred (Phase 4 wiring not yet built — explicit scope deferral per plan)**:
- D1. `MueslidianPlugin.onload` does not call `startPeriodicSync` (function exists + tested; plugin lifecycle wiring missing).
- D2. No `delayFn(60_000) → shouldCatchUp → syncAll` chain inside `onload`.
- D3. Settings tab UI input does not clamp `periodicIntervalMinutes` (the loader clamps; the UI input doesn't).
- D4. No `addStatusBarItem` call; no live status text; no 30 s re-render interval; no click → `showSyncReport`.
- D5. No `formatRelativeTime(ms)` helper.
- D6. `notifyOnReport` not invoked from any sync trigger inside `MueslidianPlugin`.
- D7. `SyncReportModal.onOpen` is a no-op; unmatched-attendees list not rendered.
- D8. README not updated this phase.

**Nits**: 4 (message text not asserted, duplicated `emitNotice` shim, empty `onOpen`, no folder-creation guard in stub Person note).

### Orchestrator-Side Changes

- Fixed test-author Vitest API mistake in `tests/sdd_mueslidian_p4_c2_periodic_timer_fires.test.ts`: `toHaveBeenCalledExactlyOnceWith()` doesn't exist — replaced with `toHaveBeenCalledOnce()` + `toHaveBeenCalledWith()`.
- The `Modal` mock in `tests/__mocks__/obsidian.ts` was already updated (prototype methods instead of class-field `vi.fn()`) to allow `vi.spyOn(Modal.prototype, 'open')`.

## SDD Amendments Needed (rollup across all phases)

11 advisory items collected across the 4 phases. None blocked any commit. Apply via `/sdd-refine specs/sdd/mueslidian.md` if you want strict alignment between SDD and implementation before moving to manual/Obsidian polish.

**Phase 1**: R3 retry-policy wording inconsistency; `src/transport.ts` not in SDD deliverables; `GranolaClient` constructor normalization undocumented.

**Phase 2**: FR19 stale-tag namespace source (renderedTags vs settings); FR11 `## My Notes` placeholder gating location (renderMeeting vs merge); FR25 `granola_synced_at` provenance (wall-clock vs `note.updated_at`).

**Phase 3**: FR35/FR42 — delisted notes never cached, refetched every sync; `network` vs `list_failed` error variants both collapse into `list_failed`; `syncAll` SDD contract says it persists state but implementation can't without a Plugin handle (move persistence to caller).

**Phase 4**: `src/main.ts` `tsc --noEmit` regressions (resolved in `f777d85`); `SyncReportModal.report` dead field.

`Next: review amendments above, /sdd-refine specs/sdd/mueslidian.md` — or skip the refine cycle and proceed with deferred wiring directly.

## Manual Test Plan

These verify the implementation end-to-end against a real Obsidian instance. The deferred Phase 4 wiring (D1–D8) must land first before steps 4–7 become observable.

1. **CLI smoke** — `export GRANOLA_API_KEY=grn_<real_key> && node dist/mueslidian.js test` → expect `OK (N notes)` on stdout, exit 0.
2. **CLI list** — `node dist/mueslidian.js list --json | head` → JSON array of note metadata.
3. **CLI get** — `node dist/mueslidian.js get not_<real_id> --transcript` → pretty-printed note body.
4. **Install + first sync** — Build via `npm run build`; copy `main.js` + `manifest.json` to `<vault>/.obsidian/plugins/mueslidian/`. Enable plugin. Run "Müslidian: Sync now" command. Expect files appearing under the configured Sync directory.
5. **Idempotency** — Re-run "Sync now" with no Granola changes. Expect a completion Notice showing 0 created / 0 updated.
6. **Annotation survival** — Edit `## My Notes` in a synced file, add a custom frontmatter key, add a personal tag. Re-run sync. Expect all three to survive.
7. **Attendee linking** — In Granola, attend a meeting with someone whose `Personen/Person - {Name}.md` exists. Sync. Expect `person/{Name}` in `tags` and a wikilink in the meta callout.
8. **On-demand bypass** — Paste a Granola URL into "Müslidian: Sync meeting by ID or URL". Expect a file written even if the note is outside the allowlist; expect a Notice flagging the override.
9. **Periodic + status bar** — Set interval = 1 min. Wait. Expect status bar to advance. Expect periodic sync to fire silently when nothing changed.
10. **Skip-existing mode** — Toggle on. Edit a meeting title in Granola. Re-sync. Expect the existing Obsidian file to be byte-identical; report counts `skippedExisting: 1`.

## Code Statistics

- **Source files**: 9 (`src/types.ts`, `src/transport.ts`, `src/granola.ts`, `src/markdown.ts`, `src/merge.ts`, `src/vault.ts`, `src/attendees.ts`, `src/settings.ts`, `src/sync.ts`, `src/main.ts`) + `bin/mueslidian.ts`.
- **Test files**: 45 total (8 phase 1 + 15 phase 2 + 14 phase 3 + 8 phase 4).
- **Tests**: 72 individual cases, 100% pass.
- **Runtime dependency**: `js-yaml` only (plus `obsidian` peer types).
- **Commits**: 5 (1 baseline + 4 phase + 1 fix).

## What's left for a manual-test-ready build

The implementation is **test-complete** but **not yet runtime-complete** — the `MueslidianPlugin` class is intentionally minimal. To make this installable in a vault, finish the deferred wiring (D1–D8) and add:

- `MueslidianPlugin.onload`: register the three commands (`Sync now`, `Sync meeting by ID or URL`, `Test connection`); call `addSettingTab(new MueslidianSettingsTab(...))`; call `addStatusBarItem(...)`; call `startPeriodicSync(...)`; fire catch-up via `shouldCatchUp + delayFn(60_000)`.
- Full settings tab UI (all fields per SDD §5.5).
- `normalizePath` validation for `personFolder` / `syncDirectory` (FR29).
- `MueslidianPlugin.saveData(...)` calls after sync (FR41 — write state + last report to data.json).
- README.md (install via BRAT, settings walkthrough, security note).
- Optional polish: `formatRelativeTime` for the status bar, 30 s re-render cadence, SyncReportModal that actually renders fields and the unmatched-attendees clickable list.

## How to Resume

All 4 phases shipped — no blocked phases. Outstanding work is:

- **Apply SDD amendments** (optional): `/sdd-refine specs/sdd/mueslidian.md`. Then `/sdd-implement specs/sdd/mueslidian.md --phase 4` to re-run Phase 4 against the refined SDD if you want the dead `SyncReportModal.report` field cleaned and the FR contracts tightened.
- **Build the deferred plugin wiring** (D1–D8): single follow-up commit; not test-driven (it's integration code Obsidian itself exercises). Or write integration tests that mock the full Plugin lifecycle.
- **Then**: `/sdd-verify specs/sdd/mueslidian.md` to audit implementation coverage against the SDD's full requirement set, then `/sdd-finish` to archive.



## Phase 3: Sync orchestration (filtering, cache)

**Status**: shipped
**Commit**: `b683e41`

### Acceptance Criteria

All 14 Phase 3 test scenarios pass. 57/57 individual tests green across
37 test files.

| # | Criterion | Tests | Status |
|---|-----------|-------|--------|
| 1 | TS3.1 — Fresh sync creates files | `p3_c1_fresh_sync_creates.test.ts` | passing |
| 2 | TS3.2 — Idempotent re-sync (warm cache) | `p3_c2_idempotent_resync.test.ts` | passing |
| 3 | TS3.3 — Updated note triggers fetch + write | `p3_c3_updated_triggers_fetch.test.ts` | passing |
| 4 | TS3.4 — Folder allowlist filtering | `p3_c4_folder_allowlist.test.ts` | passing |
| 5 | TS3.5 — Filtered-out cache stays warm | `p3_c5_filtered_cache_warm.test.ts` | passing |
| 6 | TS3.6 — Cache invalidated on updated_at advance | `p3_c6_cache_invalidated.test.ts` | passing |
| 7 | TS3.7 — Clear cache forces refetch | `p3_c7_clear_cache_refetch.test.ts` | passing (orchestrator regex fix) |
| 8 | TS3.8 — Date floor | `p3_c8_date_floor.test.ts` | passing |
| 9 | TS3.9 — Document sync limit | `p3_c9_document_sync_limit.test.ts` | passing |
| 10 | TS3.10 — Delisting | `p3_c10_delisting.test.ts` | passing |
| 11 | TS3.11 — Still-processing skip (404) | `p3_c11_still_processing_skip.test.ts` | passing |
| 12 | TS3.12 — Circuit breaker (5 consec 5xx) | `p3_c12_circuit_breaker.test.ts` | passing |
| 13 | TS3.13 — Lock prevents re-entry | `p3_c13_lock_prevents_reentry.test.ts` | passing |
| 14 | TS3.14 — On-demand bypasses filters | `p3_c14_on_demand_bypass.test.ts` | passing |

### Reviewer Findings

**Blockers**: 0 — PASS.

**SDD Amendments Needed** (advisory):
- **FR35/FR42 — cache delisted notes too**: implementation only caches IDs filtered by allowlist on first encounter; delisted notes (previously synced, now non-allowed) never enter `filteredOut`, so every sync re-fetches them. Suggested edit: cache entries should also be added for delisted notes; `[Clear filtered-out cache]` re-enables a re-check.
- **§Error Handling — `network` vs `list_failed` boundary**: SDD distinguishes them; implementation catches every `listAllNotes` error as `list_failed`. Either narrow `list_failed` to the first-page case and use `network` for later-page rejections, or drop `network` from the variants.
- **§API Contracts — `syncAll` persistence**: SDD says `syncAll` persists `state` + `SyncReport` to `data.json`. Implementation mutates `state` in place; persistence requires a Plugin handle, which lives in Phase 4 `main.ts`. Move "persist to data.json" out of `syncAll` contract into the caller.

**Deferred (Phase 4 responsibility)**:
- `src/main.ts` plugin wiring — "Müslidian: Sync now" + "Müslidian: Test connection" commands, settings tab registration, status bar.
- Settings tab `[Sync now]` / `[View last sync report]` / `[Clear filtered-out cache]` actions with confirmation dialog.
- `normalizePath` validation for `personFolder` and `syncDirectory` (FR29).
- `saveData` persistence of `state` and `SyncReport` (FR41).

**Nits**: 8 (test-driven `globalThis.Notice` shim in `src/sync.ts`, O(n²) `listed.find` in coder loop replaceable with `Map`, `documentSyncLimit` sort using ternary instead of `localeCompare`, dead `delisted: []` from `diffNotes`, empty-string ID in list-failure error entries, throwaway `stubReport` in `syncOne`, unnecessary `[...filtered].sort` spread, redundant `?? []` on non-optional `folder_membership`). All cosmetic.

### Orchestrator-Side Changes

- Fixed test-author bug in `tests/sdd_mueslidian_p3_c7_clear_cache_refetch.test.ts`: spy regex `\/notes\/(not_[a-zA-Z0-9]+)$/` had an end-anchor that excluded the `?include=transcript` query string. Removed the anchor; intent preserved.



## Phase 2: File contract (render, merge, vault, attendees)

**Status**: shipped
**Commit**: `c6ae483`

### Acceptance Criteria

All 15 Phase 2 test scenarios pass. 43/43 individual test cases green
across 23 test files (including the 8 Phase 1 tests still passing).

| # | Criterion | Tests | Status |
|---|-----------|-------|--------|
| 1 | TS2.1 — Render new file structure | `p2_c1_render_structure.test.ts` | passing |
| 2 | TS2.2 — Merge preserves user content | `p2_c2_merge_preserves_user.test.ts` | passing |
| 3 | TS2.3 — Disabled block not destroyed | `p2_c3_disabled_block_preserved.test.ts` | passing |
| 4 | TS2.4 — Calendar-null edge | `p2_c4_calendar_null.test.ts` | passing |
| 5 | TS2.5 — Matched attendee tag + wikilink | `p2_c5_attendee_tag_wikilink.test.ts` | passing |
| 6 | TS2.6 — Self-exclusion | `p2_c6_self_exclusion.test.ts` | passing |
| 7 | TS2.7 — Tag namespace stale removed | `p2_c7_tag_namespace_stale.test.ts` | passing |
| 8 | TS2.8 — Prior namespace preserved | `p2_c8_prior_namespace_preserved.test.ts` | passing |
| 9 | TS2.9 — Filename template | `p2_c9_filename_template.test.ts` | passing |
| 10 | TS2.9b — Null title fallback | `p2_c10_null_title_fallback.test.ts` | passing |
| 11 | TS2.10 — Filename sanitization | `p2_c11_filename_sanitization.test.ts` | passing |
| 12 | TS2.11 — Idempotent render+merge | `p2_c12_idempotent_render_merge.test.ts` | passing |
| 13 | TS2.12 — additionalFrontmatter creation-only | `p2_c13_additional_fm_creation_only.test.ts` | passing |
| 14 | TS2.13 — Transcript notes_on_speakers remap | `p2_c14_transcript_remap.test.ts` | passing |
| 15 | TS2.14 — additionalFrontmatter collision skip | `p2_c15_additional_fm_collision.test.ts` | passing |

### Reviewer Findings

**Blockers**: 0 — PASS.

**SDD Amendments Needed** (advisory):
- **FR19 stale-tag namespace source**: implementation derives the namespace from `renderedTags[0].split('/')[0]` instead of from `settings.attendeeTagTemplate`. Works when at least one attendee matches (covered by TS2.7); fails to remove stale tags when no attendees match. Either widen `mergeMeetingFile` API to accept the template prefix, or amend FR19 to "best effort with at least one matched attendee".
- **FR11 `## My Notes` placeholder**: SDD implies `renderMeeting` checks for the existing placeholder before inserting. Implementation: pure render unconditionally emits; `mergeMeetingFile` preserves the user-owned region between markers, which makes the emitted placeholder a no-op on re-sync. Amend FR11 to describe the render+merge interaction explicitly.
- **FR25 `granola_synced_at` provenance**: SDD says wall-clock; implementation uses `note.updated_at` (necessary for idempotency in pure tests). Amend FR25 to allow `note.updated_at` until Phase 3 introduces `nowIso` parameter, or document the deferral.

**Deferred (scope-defer — not blockers, Phase 3/4 responsibility)**:
- FR19 empty-rendered-tags branch (cosmetic for TS2.7-covered cases).
- FR29 `normalizePath` path-traversal guard on `personFolder` / `syncDirectory` (ships with settings tab in Phase 3).
- `src/settings.ts` full settings-tab UI (Obsidian `PluginSettingTab`, format warnings, `[Sync now]` button).
- `src/main.ts` plugin wiring + on-demand command + test-connection command.
- `src/vault.ts` real `buildVaultIndex`, `findExistingByGranolaId`, `ensureFolder`.
- `src/attendees.ts` real `buildAttendeeIndex` scan (currently stub returning `{}`).
- Phase-complete checks requiring live Obsidian (settings persistence, end-to-end on-demand).

**Nits**: 7 (unused imports, EOF-vs-after-marker insertion, redundant `vi.mock` calls in tests now that the vitest alias makes them unnecessary, stub-marker comments). All cosmetic.

### Orchestrator-Side Changes

- Added `tests/__mocks__/obsidian.ts` (manual mock for `Notice`, `Modal`, `TFile`, `Plugin`, `PluginSettingTab`, `Setting`, `normalizePath`, `App`, `CachedMetadata`).
- Added `vitest.config.ts` aliasing the `obsidian` package to the manual mock. Necessary because the real `obsidian` npm package has no resolvable `main`/`module`/`exports` for non-Obsidian environments; even `vi.mock('obsidian', ...)` couldn't bypass Vite's resolution step.
- Added two shared fixtures (`note-with-transcript.json`, `note-no-calendar.json`) before spawning the 15 test writers to avoid collision.



## Phase 1: Foundation (types, API client, CLI)

**Status**: shipped
**Commit**: `957d6b2`

### Acceptance Criteria

| # | Criterion | Group | Tests | Status |
|---|-----------|-------|-------|--------|
| 1 | TS1.1 — Happy path list | G0 | `tests/sdd_mueslidian_p1_c1_happy_path_list.test.ts` | passing |
| 2 | TS1.2 — Pagination | G0 | `tests/sdd_mueslidian_p1_c2_pagination.test.ts` | passing |
| 3 | TS1.3 — 429 retry | G0 | `tests/sdd_mueslidian_p1_c3_429_retry.test.ts` | passing |
| 4 | TS1.4 — 404 returns null | G0 | `tests/sdd_mueslidian_p1_c4_404_null.test.ts` | passing |
| 5 | TS1.5 — 401 throws InvalidApiKey | G0 | `tests/sdd_mueslidian_p1_c5_401_invalid_api_key.test.ts` | passing (test spy getter fixed in orchestrator) |
| 6 | TS1.6 — CLI test command success | G0 | `tests/sdd_mueslidian_p1_c6_cli_test_success.test.ts` | passing |
| 7 | TS1.7 — CLI missing key | G0 | `tests/sdd_mueslidian_p1_c7_cli_missing_key.test.ts` | passing |
| 8 | TS1.8 — API key not leaked | G0 | `tests/sdd_mueslidian_p1_c8_api_key_not_leaked.test.ts` | passing |

**Test totals**: 19/19 individual test cases passing.

### Reviewer Findings

**Blockers**: 1 (resolved in orchestrator before commit)
- [R8] CLI did not warn on non-`grn_*` API keys. Added regex check with non-blocking stderr warning to `bin/mueslidian.ts`.

**SDD Amendments Needed** (advisory; commit went through):
- **R3 internal inconsistency**: "delays 250ms/500ms/1000ms; max 3 attempts" implies 4 attempts (3 delays = 3 retries after the initial attempt = 4 total). Implementation honors TS1.3 ground truth (3 attempts total, delays 250ms then 500ms between them). Suggested SDD edit: "retry HTTP 429 with delays 250ms then 500ms between attempts; max 3 attempts total".
- **`src/transport.ts` not in SDD**: coder created a separate `src/transport.ts` module for an object-shape transport contract because TS1.7 passes one. The SDD only lists `src/types.ts` and `src/granola.ts`. Either add `src/transport.ts` to Phase 1 deliverables or change the test to import only the function-shape from `src/types`.
- **GranolaClient constructor type**: SDD says `transport: HttpTransport` (function-shape). Reality required `runCli` to normalize either function- or object-shape input before constructing the client. Document that normalization explicitly.

**Deferred (stuck tests)**:
- Optional Phase 1 scaffolding not yet on disk: `manifest.json`, `esbuild.config.mjs`, `versions.json`, `Makefile`, `.env.example`, `README.md`, `tests/__mocks__/obsidian.ts`. None block the 8 test scenarios. Deferred to a follow-up commit before declaring "Phase complete when `make setup && make build`" satisfied per the SDD gate.

**Nits**: 4 (style/cosmetic — see review log in `/tmp/claude-501/sdd-impl-review-kXtsfW.md`).

### Orchestrator Test-File Adjustments

Two test files needed minimal in-place fixes — author bugs, not implementation defects:

- `tests/sdd_mueslidian_p1_c5_401_invalid_api_key.test.ts`: spy getter pattern `{ ..., get calls() {...} }` was inside a spread, which captures the value at construction (always 0). Replaced with a direct getter on the return object.
- `tests/sdd_mueslidian_p1_c1_happy_path_list.test.ts`: fixture `list-page-1.json` has `hasMore: true` (correct for the pagination test, c2). c1 expects single-page behaviour; added a per-test override `{ ...fixture, hasMore: false, cursor: null }`.

Both changes preserve the original test intent. Recorded in `/tmp/claude-501/sdd-impl-history-a6gfY8.md`.

## SDD Amendments Needed

Three advisory items (above). Apply them to `specs/sdd/mueslidian.md` before Phase 2 if you want strict alignment between SDD and implementation:

1. R3 retry policy wording.
2. Add `src/transport.ts` to Phase 1 deliverables (or remove the object-shape requirement from TS1.7).
3. Document `GranolaClient` transport normalization in §API Contracts.

`Next: review amendments above, /sdd-refine specs/sdd/mueslidian.md, then /sdd-implement specs/sdd/mueslidian.md --from 2`

Amendments are advisory — Phase 1 is already committed. You can also skip the refine cycle and proceed directly with `/sdd-implement specs/sdd/mueslidian.md --from 2` if the amendments don't affect downstream phases (they don't).

## Manual Test Plan (Phase 1 end-to-end)

1. Set a real key: `export GRANOLA_API_KEY=grn_<your_key>`
2. Build (after Phase 4 adds esbuild config): `npm run build`
3. Run CLI: `node dist/mueslidian.js test`
   - Expected: `OK (N notes)` on stdout, exit 0.
4. List: `node dist/mueslidian.js list --json | head`
   - Expected: JSON array of note metadata.
5. Fetch one note: `node dist/mueslidian.js get not_<id> --transcript`
   - Expected: pretty-printed note body.
6. Missing-key check: `unset GRANOLA_API_KEY && node dist/mueslidian.js test`
   - Expected: stderr `GRANOLA_API_KEY is required`, exit non-zero.
7. Bad-format check: `GRANOLA_API_KEY=foo node dist/mueslidian.js test`
   - Expected: stderr warning, command still runs (likely fails with InvalidApiKey from Granola).

Note: Phase 1 deliberately produces no Obsidian-visible behavior; verification is CLI- and Vitest-only.

## How to Resume Blocked Phases

- **Phase 2**: `/sdd-implement specs/sdd/mueslidian.md --phase 2` or `--from 2`. 14 test scenarios (TS2.1–TS2.14) cover pure render/merge/vault/attendees plus the on-demand command and settings tab.
- **Phase 3**: `/sdd-implement specs/sdd/mueslidian.md --phase 3` after Phase 2. 14 test scenarios for `syncAll` + `diffNotes` + filtered-out cache.
- **Phase 4**: `/sdd-implement specs/sdd/mueslidian.md --phase 4` after Phase 3. 7 test scenarios for periodic timer, status bar, QuickAdd, README.
