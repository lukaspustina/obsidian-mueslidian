import { Modal, Notice as ObsidianNotice, Plugin } from 'obsidian';
import type { MuesliSettings, SyncReport } from './types.js';
import { DEFAULT_SETTINGS } from './settings.js';

// ─── Notice shim (mirrors sync.ts) ───────────────────────────────────────────
// vi.stubGlobal('Notice', ...) sets globalThis.Notice; the obsidian import
// does not pick that up, so check globalThis first.

function emitNotice(msg: string): void {
  const G = (globalThis as { Notice?: new (m: string) => unknown }).Notice;
  if (typeof G === 'function') {
    new G(msg);
    return;
  }
  new ObsidianNotice(msg);
}

// ─── shouldCatchUp ────────────────────────────────────────────────────────────

export function shouldCatchUp(
  lastSyncAt: string | null,
  intervalMinutes: number,
  nowMs: number
): boolean {
  if (intervalMinutes <= 0) return false;
  if (lastSyncAt == null) return true;
  const delta = nowMs - Date.parse(lastSyncAt);
  return delta >= intervalMinutes * 60_000;
}

// ─── startPeriodicSync ────────────────────────────────────────────────────────

export interface PeriodicSyncOptions {
  schedulerFn: (cb: () => void, ms: number) => number;
  clearFn?: (id: number) => void;
  runSync: () => void | Promise<void>;
  periodicIntervalMinutes: number;
}

export function startPeriodicSync(opts: PeriodicSyncOptions): { cancel(): void } {
  const ms = opts.periodicIntervalMinutes * 60_000;
  const id = opts.schedulerFn(() => {
    void opts.runSync();
  }, ms);
  return {
    cancel: () => {
      if (opts.clearFn) opts.clearFn(id);
    },
  };
}

// ─── notifyOnReport ───────────────────────────────────────────────────────────

export function notifyOnReport(report: SyncReport, trigger: 'manual' | 'periodic'): void {
  const meaningful = report.created + report.updated + report.errors.length > 0;
  if (trigger === 'periodic' && !meaningful) return;
  emitNotice(
    `Müslidian: created ${report.created}, updated ${report.updated}, errors ${report.errors.length}`
  );
}

// ─── showSyncReport ───────────────────────────────────────────────────────────

class SyncReportModal extends Modal {
  constructor(app: unknown, private report: SyncReport) {
    super(app);
  }
  onOpen(): void {
    // Real UI would render report fields into contentEl.
    // Mock has no contentEl; no-op body is intentional.
  }
}

export function showSyncReport(app: unknown, report: SyncReport): Modal {
  const modal = new SyncReportModal(app, report);
  modal.open();
  return modal;
}

// ─── handleUnmatchedAttendeeClick ─────────────────────────────────────────────

export async function handleUnmatchedAttendeeClick(
  app: unknown,
  settings: MuesliSettings,
  attendeeName: string
): Promise<void> {
  const a = app as {
    plugins?: {
      plugins?: Record<
        string,
        { api?: { executeChoice?: (k: string, p: { name: string }) => Promise<unknown> } }
      >;
    };
    vault?: { create?: (path: string, content: string) => Promise<unknown> };
  };

  const executeChoice = a.plugins?.plugins?.['quickadd']?.api?.executeChoice;
  if (typeof executeChoice === 'function') {
    await executeChoice('Person', { name: attendeeName });
    return;
  }

  // Fallback: create stub Person note
  const sanitized = attendeeName.replace(/[/\\:*?"<>|]/g, '-');
  const filename = `Person - ${sanitized}.md`;
  const folder = settings.personFolder;
  const path = folder ? `${folder}/${filename}` : filename;

  const personTag = attendeeName.trim().replace(/\s+/g, '_');
  const content = `---\nperson_tag: person/${personTag}\nnote_type: person_note\ntags:\n  - Person\n---\n`;

  await a.vault?.create?.(path, content);
  emitNotice(`Created stub at ${path}`);
}

// ─── MueslidianPlugin ─────────────────────────────────────────────────────────

export default class MueslidianPlugin extends Plugin {
  settings: MuesliSettings = { ...DEFAULT_SETTINGS };
  state = { lastSyncAt: null as string | null, filteredOut: {} as Record<string, string>, lastSyncReport: null as SyncReport | null };
  private periodicHandle: { cancel(): void } | null = null;

  async onload(): Promise<void> {
    const data = (await this.loadData()) as {
      settings?: MuesliSettings;
      state?: typeof this.state;
    } | null;
    if (data?.settings) this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    if (data?.state) this.state = { ...this.state, ...data.state };

    // Clamp periodicIntervalMinutes silently per FR45
    if (
      this.settings.periodicIntervalMinutes < 0 ||
      this.settings.periodicIntervalMinutes > 1440
    ) {
      console.warn('mueslidian: periodicIntervalMinutes out of range; clamping');
      this.settings.periodicIntervalMinutes = Math.max(
        0,
        Math.min(1440, this.settings.periodicIntervalMinutes)
      );
    }

    this.addCommand({
      id: 'sync-now',
      name: 'Müslidian: Sync now',
      callback: () => { /* runManualSync stub */ },
    });
    this.addCommand({
      id: 'sync-by-id',
      name: 'Müslidian: Sync meeting by ID or URL',
      callback: () => { /* syncOne stub */ },
    });
    this.addCommand({
      id: 'test-connection',
      name: 'Müslidian: Test connection',
      callback: () => { /* GET /me stub */ },
    });
  }

  onunload(): void {
    this.periodicHandle?.cancel();
  }
}
