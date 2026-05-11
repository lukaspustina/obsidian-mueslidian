# PRD Refine Findings: granola-sync

Generated: 2026-05-11
Mode: findings-only (no rewrite performed)

## Concreteness Findings

### Vague / Unmeasurable Goals

- **G1**: "within minutes of being processed and moved to an allowed folder" — "minutes" is unbounded. Propose: "within one polling interval (configurable; default ≤ 5 min) of the note appearing in an allowed Granola folder."
- **G4**: "zero file writes and zero `getNote` API calls" — good signal, but no measurable threshold for the list call itself. The NFR2 entry covers steady-state timing but G4 duplicates NFR3 without adding precision. Consider merging or dropping G4 and pointing to NFR2+NFR3.

### Scenarios Written as Feature Descriptions, Not User Scenarios

- **S1**: "Sensible defaults; configurable bounds … keep the first sync manageable" — describes the mechanism, not what the user does or observes. Propose: "User installs plugin, enters API key, runs 'Sync now'. Sees N files created in `Besprechungen`; N is bounded by the date-floor and count-cap defaults so the vault isn't flooded."
- **S2**: "User edits and curates notes inside Granola; moves them to a designated 'Reviewed' folder; only those reach Obsidian." — passable, but "a designated 'Reviewed' folder" implies a fixed name that doesn't match the configurable allowlist. Propose: "User moves a curated note into any folder listed in **Allowed Granola folders**; next sync creates the corresponding Obsidian file."
- **S8**: "User switches to 'Skip existing notes' mode; previously-synced files become immutable, future Granola changes ignored." — passive. Propose: "User enables 'Skip existing notes', then reruns sync. Existing files are byte-identical after the run; a note whose Granola title changed shows no update."

### Open Decisions That Are Just Deferred Work

- **§10 "QuickAdd integration details — whether to call its programmatic API or replicate template-apply ourselves"** — this is a real architectural fork: one path adds a plugin dependency, the other duplicates logic. The PRD should either record the chosen option (with rationale) or list the two concrete options plus the decision criterion, not just say it was "verified in implementation Phase 1." Propose: state the options (QuickAdd API vs. own template apply) and the criterion for choosing (e.g., "prefer QuickAdd API if stable; fall back to own implementation if API is undocumented or fragile").

### Missing Scope Boundaries / Ambiguous Edges

- **FR2.1**: "A note is synced if any of its folder paths matches an entry. Empty allowlist disables filtering." — "disables filtering" is ambiguous: does it mean all notes are synced, or no notes are synced? Propose: "Empty allowlist = no folder restriction; all notes are candidates (subject to date/count filters)."
- **FR4.2**: "Old Person notes without a `person_tag` frontmatter key still participate; the plugin derives `person_tag` as `{template prefix}/{First}_{Last}`" — the derived value uses "template prefix" but the setting is called "Attendee tag template" and its default is `person/{name}`. There's no "prefix" concept defined. Propose: clarify that `{template prefix}` means the literal string before `/{name}` in the template, e.g. `person` when the template is `person/{name}`, and add a worked example.
- **FR4.4**: "Each entry in the list is a click-target that launches the user's existing QuickAdd 'Person' command pre-filled with the attendee's name." — "the user's existing" implies QuickAdd is already installed and a macro named "Person" already exists. This is an unverified assumption about the environment. Propose: add a note that this feature is conditional on QuickAdd being installed and a macro named exactly "Person" being present; graceful degradation if absent (e.g., plain text name, no click).
- **FR6.3**: "`filtered_out` map … caches IDs filtered out by the allowlist (with their `updated_at`)" — does this map also include notes filtered by date/count, or only by folder allowlist? Propose: specify explicitly (e.g., "only folder-allowlist exclusions are cached; date/count exclusions are re-evaluated on every sync").

### Acceptance Criteria Gaps

- **AC15**: "with interval `1`, the periodic timer fires; status bar advances; Notices fire only on change or error." — "fires" is not testable without a clock mock. Propose: "with interval set to 1 minute and Obsidian open for ≥ 60s, the status bar timestamp advances and a sync report is produced."
- **AC16**: "closing Obsidian past an interval and reopening fires one sync ~60s after open" — "~60s" is informal. Propose: "within 61 ± 5 seconds of Obsidian reopening."
- **AC4**: "File count equals expected" — "expected" is not defined. Propose: "File count equals the number of notes in the Granola test account that satisfy the active filters."

### Fluff / Imprecise Language

- **§1, last paragraph**: "The motivation is not novel functionality — comparable plugins exist" — accurate but adds no spec value. No action needed unless trimming prose.
- No outright fluff words ("world-class", "magical", etc.) detected.

---

## Coherence Findings

### F1 — C3 contradicts G4 / NFR3: filtered-out cache doesn't make initial filtering idempotent

**G4:** "Sync is idempotent: a sync with no Granola-side changes produces zero file writes and zero `getNote` API calls."

**NFR3:** "A no-op sync produces zero file writes and zero `getNote` API calls."

**C3:** "The list endpoint returns metadata only. `folder_membership` is only on the single-note endpoint — folder-allowlist filtering therefore costs one `getNote` per never-before-seen ID."

**Conflict:** For notes in a non-allowed folder, the *first* sync incurs one `getNote` call per note (to read `folder_membership`), then they enter `filtered_out`. Subsequent syncs are free only while the cache is warm. After `[Clear filtered-out cache]` or a plugin reset, those `getNote` calls recur. G4/NFR3 as written imply any sync with no Granola-side changes is zero-call — false when the cache is cold.

**Resolution:** Qualify G4/NFR3: "…provided the filtered-out cache is warm." Add a note acknowledging that a cold/cleared cache will issue one `getNote` per unseen filtered note.

### F2 — FR4.4 (QuickAdd integration) introduces an undeclared runtime dependency

**§4:** "The user is the author. One operator, one vault, one Granola account."

**FR4.4:** "Each entry in the list [unmatched attendees] is a click-target that launches the user's existing QuickAdd 'Person' command pre-filled with the attendee's name."

**Conflict:** FR4.4 hard-codes a dependency on QuickAdd being installed and a command named "Person" existing. The Users section doesn't list QuickAdd as a prerequisite, and Open Questions §10 defers the integration approach to the SDD — meaning the dependency isn't settled. If QuickAdd is absent or misconfigured, the click-target silently fails with no fallback stated.

**Resolution:** Either (a) add QuickAdd as a stated prerequisite in §7 with explicit graceful degradation (plain-text display if absent), or (b) soften FR4.4 to "show unmatched names; a click-target attempts to invoke QuickAdd 'Person' if detected, else opens a new blank note pre-filled with the name."

### F3 — NFR2 (5-second steady-state) is unverifiable without an API latency assumption

**NFR2:** "Steady-state sync with no Granola-side changes completes in under 5 seconds (list-only, no body fetches)."

**C3 / FR2.3:** No cap on document sync limit (`0` = unlimited); list endpoint may require multiple paginated calls for large note corpora.

**Conflict:** The 5-second budget is API-latency-sensitive. For a user with hundreds of meetings and a non-empty allowlist, a paginated list call alone could exceed 5 seconds depending on network or API conditions. There is no stated assumption about API response time or note corpus size to make the criterion testable.

**Resolution:** Add to §7: "Assumed: `GET /v1/notes` completes within 2s for the user's note corpus." Or scope NFR2: "…for a vault of up to 500 notes with a healthy API (sub-2s list response)."

### F4 — AC5 (idempotency test) is stronger than G4 but doesn't match its own precondition

**AC5:** "a second consecutive 'Sync now' produces zero file writes and zero `getNote` API calls."

**G4 / C3:** The guarantee holds only when the filtered-out cache is warm after the preceding sync.

**Conflict:** AC5 has no stated precondition about cache state. A user who runs sync → clears cache → runs sync would observe `getNote` calls on the second run, violating AC5 as written. The test criterion is accurate for the happy path but misleading about the full behavioral contract.

**Resolution:** Add precondition to AC5: "given a warm filtered-out cache from the immediately preceding sync and no cache-clear in between."

### F5 — S8 (Frozen archive) implies intent not surfaced in UX or Settings

**S4 / S8:** "User switches to 'Skip existing notes' mode; previously-synced files become immutable, future Granola changes ignored." Context implies deliberate archival of a past meeting period.

**§5.5:** The setting is named "Skip existing notes" with no description of the archival intent.

**Minor inconsistency (not a blocker):** S8 frames a user intent (freeze an archive) that the settings UX doesn't communicate. A user enabling this setting for unrelated reasons could accidentally freeze notes without understanding the consequence. The PRD doesn't guarantee this is the only use of the toggle.

**Resolution (low priority):** Either rename the setting to "Frozen archive (skip updates to existing notes)" with a tooltip, or collapse S8 into S3's description and remove it as a standalone scenario.
