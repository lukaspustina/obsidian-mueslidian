# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-14

Initial release of Müslidian — one-way sync from Granola into Obsidian.

### Added
- Foundation: typed Granola API client, standalone Node CLI (5147a7f)
- File contract: render, merge, vault scan, attendee indexing (bfe7f19)
- Sync orchestration: `syncAll`, `diffNotes`, filtered-out cache (058710b)
- Plugin wiring: periodic sync, status bar, QuickAdd integration, skip-existing mode (5294063)
- Closing SDD gaps: plugin wiring, settings tab, README (5ae9b20)
- Configurable marker syntax (HTML / Obsidian), optional meta callout, transcript heading + collapsed callout, instant status-bar feedback (1ccb559)
- Typed-attendee discovery from configured headings (e.g. `## Teilnehmer`) (594d665)
- `{time}` placeholder + time / sequence-number collision disambiguator for filenames (652586e)

### Fixed
- Type `SyncReportModal` app param + extract `MuesliPluginState` (74f015f)
- Close round-two verify partials (5a706bb)
- Close round-three verify partials — D15 wiring, AC1/AC2/AC3/AC13 (9efbf03)
- Close final two verify partials — R25 wall-clock + clear-cache confirm (c30778d)
- R10: insert missing marker block at SDD-prescribed position, not EOF (c9abc5b)
- Union user-supplied `tags` from `additionalFrontmatter` instead of dropping them (f3ebd58)

### Changed
- Initial planning artifacts: PRD, SDD, CLAUDE.md (c73593d)
- Archive completed SDD into `specs/done/sdd/` (78d12b5)
- Rewrite README — clearer pitch, full feature surface (c7ac2dd)
- Add MIT license file (f58ccca)
- Drop personal identifier from PRD header (c397dbb)
