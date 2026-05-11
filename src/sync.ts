import { Notice } from 'obsidian';
import type {
  DiffResult,
  GranolaNoteId,
  MuesliSettings,
  MuesliState,
  Note,
  NoteWithBody,
  SyncReport,
  VaultIndex,
} from './types.js';
import type { GranolaClient } from './granola.js';
import { renderMeeting, stampAdditionalFrontmatter } from './markdown.js';
import { mergeMeetingFile, splitFrontmatter } from './merge.js';
import { buildVaultIndex, filenameFor } from './vault.js';
import { buildAttendeeIndex } from './attendees.js';
import { load as yamlLoad } from 'js-yaml';

// ─── module-level lock ────────────────────────────────────────────────────────

let syncLockHeld = false;

// ─── helpers ──────────────────────────────────────────────────────────────────

function emitNotice(msg: string): void {
  // TS3.13 / TS3.14: vi.stubGlobal('Notice', ...) sets globalThis.Notice.
  // The import from 'obsidian' does NOT pick that up, so we check globalThis first.
  const G = (globalThis as { Notice?: new (m: string) => unknown }).Notice;
  if (typeof G === 'function') {
    new G(msg);
    return;
  }
  new Notice(msg);
}

function extractGranolaId(input: string): GranolaNoteId | null {
  const m = input.match(/not_[a-zA-Z0-9]{14}/);
  return m ? m[0] : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyReport(startedAt: string): SyncReport {
  return {
    startedAt,
    endedAt: startedAt,
    durationMs: 0,
    listed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    filteredOut: 0,
    delisted: 0,
    skippedExisting: 0,
    stillProcessing: 0,
    errors: [],
    unmatchedAttendees: [],
    aborted: null,
  };
}

function finalize(r: SyncReport): SyncReport {
  r.endedAt = nowIso();
  r.durationMs = Date.parse(r.endedAt) - Date.parse(r.startedAt);
  return r;
}

function parseAdditionalFrontmatter(s: string): Record<string, string> {
  if (!s.trim()) return {};
  try {
    const parsed = yamlLoad(s);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = String(v);
      }
      return out;
    }
  } catch {
    console.warn('mueslidian: failed to parse additionalFrontmatter');
  }
  return {};
}

async function ensureSyncFolder(app: unknown, dir: string): Promise<void> {
  if (!dir) return;
  const v = (app as { vault?: { adapter?: { exists?: (p: string) => Promise<boolean> }; createFolder?: (p: string) => Promise<void> } }).vault;
  if (!v) return;
  const exists = await v.adapter?.exists?.(dir);
  if (!exists) {
    try { await v.createFolder?.(dir); } catch { /* race or already exists */ }
  }
}

function passesAllowlist(note: NoteWithBody, settings: MuesliSettings): boolean {
  if (settings.allowedFolders.length === 0) return true;
  return (note.folder_membership ?? []).some(f => settings.allowedFolders.includes(f.name));
}

async function writeNote(
  app: unknown,
  settings: MuesliSettings,
  vaultIndex: VaultIndex,
  attendeeIndex: Record<string, string>,
  note: NoteWithBody,
  report: SyncReport
): Promise<void> {
  const additional = parseAdditionalFrontmatter(settings.additionalFrontmatter);
  const vault = (app as { vault: Record<string, unknown> }).vault;
  const existing = vaultIndex[note.id];

  if (existing) {
    const file = existing.file;
    const text = await (vault['read'] as (f: unknown) => Promise<string>)(file);
    const { fm } = splitFrontmatter(text);
    const nos =
      fm['notes_on_speakers'] &&
      typeof fm['notes_on_speakers'] === 'object' &&
      !Array.isArray(fm['notes_on_speakers'])
        ? (fm['notes_on_speakers'] as Record<string, string>)
        : {};
    const rendered = renderMeeting(note, nos, settings, attendeeIndex);
    const merged = mergeMeetingFile(text, rendered);
    const final = stampAdditionalFrontmatter(merged, additional, false);
    await (vault['modify'] as (f: unknown, c: string) => Promise<void>)(file, final);
    report.updated++;
  } else {
    await ensureSyncFolder(app, settings.syncDirectory);
    const existingNames = new Set(
      Object.values(vaultIndex).map(e => {
        const p = (e.file as { path: string }).path;
        const slash = p.lastIndexOf('/');
        return slash >= 0 ? p.slice(slash + 1) : p;
      })
    );
    const fname = filenameFor(note, settings, existingNames);
    const path = settings.syncDirectory ? `${settings.syncDirectory}/${fname}` : fname;
    const rendered = renderMeeting(note, {}, settings, attendeeIndex);
    const final = stampAdditionalFrontmatter(rendered, additional, true);
    await (vault['create'] as (p: string, c: string) => Promise<unknown>)(path, final);
    report.created++;
  }
}

// ─── diffNotes ────────────────────────────────────────────────────────────────

export function diffNotes(
  vaultIndex: VaultIndex,
  listed: Note[],
  state: MuesliState,
  settings: MuesliSettings
): DiffResult {
  let candidates = [...listed];

  // (a) documentSyncLimit: sort desc by created_at, keep top N
  if (settings.documentSyncLimit > 0) {
    candidates.sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : 0));
    candidates = candidates.slice(0, settings.documentSyncLimit);
  }

  // (b) earliestCreationDate floor
  if (settings.earliestCreationDate) {
    const floor = Date.parse(settings.earliestCreationDate + 'T00:00:00Z');
    candidates = candidates.filter(n => Date.parse(n.created_at) >= floor);
  }

  const toCreate: GranolaNoteId[] = [];
  const toUpdate: GranolaNoteId[] = [];
  const unchanged: GranolaNoteId[] = [];
  const filteredOut: GranolaNoteId[] = [];
  const skippedExisting: GranolaNoteId[] = [];
  const newFilteredOutCache: Record<GranolaNoteId, string> = {};

  for (const note of candidates) {
    const id = note.id;

    // (c) allowedFolders cache check (cache hit = updated_at matches)
    const cachedUpdatedAt = state.filteredOut[id];
    if (cachedUpdatedAt !== undefined && cachedUpdatedAt === note.updated_at) {
      filteredOut.push(id);
      newFilteredOutCache[id] = cachedUpdatedAt;
      continue;
    }

    // skipExistingNotes: skip vault files that already exist
    if (settings.skipExistingNotes && vaultIndex[id]) {
      skippedExisting.push(id);
      continue;
    }

    // Vault classification
    const entry = vaultIndex[id];
    if (entry) {
      if (entry.granolaUpdatedAt >= note.updated_at) {
        unchanged.push(id);
      } else {
        toUpdate.push(id);
      }
    } else {
      toCreate.push(id);
    }
  }

  return {
    toCreate,
    toUpdate,
    unchanged,
    filteredOut,
    delisted: [], // populated by syncAll post-fetch
    skippedExisting,
    newFilteredOutCache,
  };
}

// ─── syncAll ──────────────────────────────────────────────────────────────────

export async function syncAll(
  app: unknown,
  settings: MuesliSettings,
  state: MuesliState,
  client: GranolaClient,
  onProgress?: (n: number, total: number) => void
): Promise<SyncReport> {
  const startedAt = nowIso();
  if (syncLockHeld) {
    emitNotice('Müslidian sync already running');
    return emptyReport(startedAt);
  }
  syncLockHeld = true;
  const report = emptyReport(startedAt);

  try {
    // Step 1: list all pages
    const listed: Note[] = [];
    try {
      for await (const n of client.listAllNotes({})) listed.push(n);
    } catch (err) {
      report.aborted = 'list_failed';
      report.errors.push({ id: '' as GranolaNoteId, reason: String(err) });
      return finalize(report);
    }
    report.listed = listed.length;

    // Step 2: build vault index
    const vaultIndex = buildVaultIndex(app, settings);

    // Step 3: diff
    const diff = diffNotes(vaultIndex, listed, state, settings);

    // Step 4: attendee index
    const attendeeIndex = buildAttendeeIndex(app, settings);

    // Step 5: working filtered-out cache (starts with cache-hit entries from diff)
    const newCache: Record<GranolaNoteId, string> = { ...diff.newFilteredOutCache };

    // Step 6: process toCreate ∪ toUpdate
    const todo = [...diff.toCreate, ...diff.toUpdate];
    let consecutiveErrors = 0;

    for (let i = 0; i < todo.length; i++) {
      onProgress?.(i, todo.length);
      const id = todo[i];
      const listedNote = listed.find(n => n.id === id)!;

      let note: NoteWithBody | null;
      try {
        note = await client.getNote(id, { includeTranscript: settings.includeTranscript });
      } catch (err) {
        consecutiveErrors++;
        report.errors.push({ id, reason: String(err) });
        if (consecutiveErrors >= 5) {
          report.aborted = 'api_unhealthy';
          break;
        }
        continue;
      }

      if (note === null) {
        report.stillProcessing++;
        consecutiveErrors = 0;
        continue;
      }
      consecutiveErrors = 0;

      // Post-fetch allowlist check (allowedFolders lives on NoteWithBody)
      if (!passesAllowlist(note, settings)) {
        if (vaultIndex[id]) {
          report.delisted++;
        } else {
          report.filteredOut++;
          newCache[id] = listedNote.updated_at;
        }
        continue;
      }

      await writeNote(app, settings, vaultIndex, attendeeIndex, note, report);
    }

    // Step 7: roll up diff counts
    report.unchanged += diff.unchanged.length;
    report.filteredOut += diff.filteredOut.length;
    report.skippedExisting += diff.skippedExisting.length;

    // Step 8: persist state mutations
    for (const k of Object.keys(state.filteredOut)) delete state.filteredOut[k];
    for (const [k, v] of Object.entries(newCache)) state.filteredOut[k] = v;
    state.lastSyncAt = nowIso();
    state.lastSyncReport = report;

    return finalize(report);
  } finally {
    syncLockHeld = false;
  }
}

// ─── syncOne ──────────────────────────────────────────────────────────────────

export async function syncOne(
  app: unknown,
  settings: MuesliSettings,
  state: MuesliState,
  client: GranolaClient,
  idOrUrl: string
): Promise<{ written: boolean }> {
  const id = extractGranolaId(idOrUrl);
  if (!id) {
    emitNotice('Müslidian: invalid Granola note ID or URL');
    return { written: false };
  }

  if (syncLockHeld) {
    emitNotice('Müslidian sync already running');
    return { written: false };
  }
  syncLockHeld = true;

  try {
    const note = await client.getNote(id, { includeTranscript: settings.includeTranscript });
    if (note === null) {
      emitNotice('Müslidian: note still processing');
      return { written: false };
    }

    // Allowlist bypass notice
    if (settings.allowedFolders.length > 0 && !passesAllowlist(note, settings)) {
      emitNotice('Müslidian: bypassing allowlist for on-demand sync');
    }

    const vaultIndex = buildVaultIndex(app, settings);
    const attendeeIndex = buildAttendeeIndex(app, settings);
    const stubReport = emptyReport(nowIso());
    await writeNote(app, settings, vaultIndex, attendeeIndex, note, stubReport);

    return { written: true };
  } finally {
    syncLockHeld = false;
  }
}
