import { Modal, Notice as ObsidianNotice, Plugin, requestUrl } from 'obsidian';
import type { App } from 'obsidian';
import type {
  GranolaNoteId,
  HttpTransport,
  MuesliSettings,
  MuesliState,
  SyncReport,
} from './types.js';
import { DEFAULT_SETTINGS, MueslidianSettingTab, clampInterval } from './settings.js';
import { GranolaClient } from './granola.js';
import { syncAll, syncOne } from './sync.js';
import { buildAttendeeIndex } from './attendees.js';

type MuesliPluginState = MuesliState;

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
  nowMs: number,
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

/**
 * Catch-up wiring per FR44. `delayFn` is injectable so tests can resolve it
 * immediately. Default: 60 s setTimeout.
 *
 * - If `shouldCatchUp` is false, this is a no-op (returns immediately).
 * - Otherwise awaits `delayFn(60_000)` then calls `runSync`.
 */
export interface CatchUpOptions {
  lastSyncAt: string | null;
  periodicIntervalMinutes: number;
  runSync: () => void | Promise<void>;
  delayFn?: (ms: number) => Promise<void>;
  nowMs?: number;
}

const defaultDelayFn = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export async function scheduleCatchUp(opts: CatchUpOptions): Promise<boolean> {
  const now = opts.nowMs ?? Date.now();
  if (!shouldCatchUp(opts.lastSyncAt, opts.periodicIntervalMinutes, now)) return false;
  const delay = opts.delayFn ?? defaultDelayFn;
  await delay(60_000);
  await opts.runSync();
  return true;
}

// ─── notifyOnReport ───────────────────────────────────────────────────────────

export function notifyOnReport(report: SyncReport, trigger: 'manual' | 'periodic'): void {
  const meaningful = report.created + report.updated + report.errors.length > 0;
  if (trigger === 'periodic' && !meaningful) return;
  emitNotice(
    `Müslidian: created ${report.created}, updated ${report.updated}, errors ${report.errors.length}`,
  );
}

// ─── Relative time formatter (R46) ───────────────────────────────────────────

export function formatRelativeTime(thenIso: string | null, nowMs: number = Date.now()): string {
  if (thenIso == null) return 'never';
  const deltaSec = Math.max(0, Math.floor((nowMs - Date.parse(thenIso)) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin} min ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr} hr ago`;
  return '>24 hr ago';
}

// ─── SyncReportModal ──────────────────────────────────────────────────────────

class SyncReportModal extends Modal {
  constructor(
    app: App,
    private report: SyncReport,
    private settings: MuesliSettings,
  ) {
    super(app);
  }

  onOpen(): void {
    const el = (this as unknown as { contentEl?: HTMLElement }).contentEl;
    if (!el) return; // test mock has no contentEl
    el.empty?.();
    el.createEl?.('h2', { text: 'Müslidian sync report' });

    const list = el.createEl?.('ul');
    const summary: Array<[string, string | number]> = [
      ['Listed', this.report.listed],
      ['Created', this.report.created],
      ['Updated', this.report.updated],
      ['Unchanged', this.report.unchanged],
      ['Filtered out', this.report.filteredOut],
      ['Delisted', this.report.delisted],
      ['Skipped (skip-existing)', this.report.skippedExisting],
      ['Still processing', this.report.stillProcessing],
      ['Errors', this.report.errors.length],
      ['Duration (ms)', this.report.durationMs],
      ['Aborted', this.report.aborted ?? '—'],
    ];
    if (list?.createEl) {
      for (const [k, v] of summary) {
        const li = list.createEl('li');
        li.setText?.(`${k}: ${v}`);
      }
    }

    if (this.report.unmatchedAttendees.length > 0) {
      el.createEl?.('h3', { text: 'Unmatched attendees (click to create Person note)' });
      const ulU = el.createEl?.('ul');
      for (const ent of this.report.unmatchedAttendees) {
        const li = ulU?.createEl?.('li');
        if (!li) continue;
        const a = li.createEl?.('a', { text: ent.name }) as HTMLElement | undefined;
        if (a) {
          a.style.cursor = 'pointer';
          a.style.textDecoration = 'underline';
          a.onclick = () => {
            void handleUnmatchedAttendeeClick(this.app, this.settings, ent.name);
          };
        }
        const titles = ent.sourceNoteTitles.join(', ');
        li.appendText?.(`  — in: ${titles}`);
      }
    }
  }
}

export function showSyncReport(
  app: unknown,
  report: SyncReport,
  settings: MuesliSettings = DEFAULT_SETTINGS,
): Modal {
  const modal = new SyncReportModal(app as App, report, settings);
  modal.open();
  return modal;
}

// ─── handleUnmatchedAttendeeClick ─────────────────────────────────────────────

export async function handleUnmatchedAttendeeClick(
  app: unknown,
  settings: MuesliSettings,
  attendeeName: string,
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

  // Fallback: create stub Person note (R29: sanitize the name)
  const sanitized = attendeeName.replace(/[/\\:*?"<>|]/g, '-').trim();
  const filename = `Person - ${sanitized}.md`;
  const folder = settings.personFolder;
  const path = folder ? `${folder}/${filename}` : filename;

  const personTag = attendeeName.trim().replace(/\s+/g, '_');
  const content = `---\nperson_tag: person/${personTag}\nnote_type: person_note\ntags:\n  - Person\n---\n`;

  await a.vault?.create?.(path, content);
  emitNotice(`Created stub at ${path}`);
}

// ─── HTTP transport adapter for the plugin runtime ───────────────────────────

const requestUrlTransport: HttpTransport = async (url, opts) => {
  const res = await requestUrl({ url, method: opts.method, headers: opts.headers, throw: false });
  // Obsidian exposes `json` as already-parsed (or undefined if non-JSON body)
  const body: unknown = (res as unknown as { json?: unknown }).json ?? null;
  return { status: res.status, body };
};

// ─── MueslidianPlugin ─────────────────────────────────────────────────────────

export default class MueslidianPlugin extends Plugin {
  settings: MuesliSettings = { ...DEFAULT_SETTINGS };
  state: MuesliPluginState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };
  private periodicHandle: { cancel(): void } | null = null;
  private statusBarEl: { setText(s: string): void } | null = null;
  private statusBarIntervalId: number | null = null;
  private statusState: 'idle' | 'syncing' | 'error' = 'idle';

  async onload(): Promise<void> {
    const data = (await this.loadData()) as {
      settings?: MuesliSettings;
      state?: MuesliPluginState;
    } | null;
    if (data?.settings) this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    if (data?.state) this.state = { ...this.state, ...data.state };

    // FR45: clamp periodicIntervalMinutes silently on load
    const before = this.settings.periodicIntervalMinutes;
    this.settings.periodicIntervalMinutes = clampInterval(before);
    if (before !== this.settings.periodicIntervalMinutes) {
      console.warn(
        `Müslidian: periodicIntervalMinutes clamped from ${before} to ${this.settings.periodicIntervalMinutes}`,
      );
    }

    // ── Commands ────────────────────────────────────────────────────────────
    this.addCommand({
      id: 'sync-now',
      name: 'Müslidian: Sync now',
      callback: () => void this.triggerSyncNow('manual'),
    });

    this.addCommand({
      id: 'sync-by-id',
      name: 'Müslidian: Sync meeting by ID or URL',
      editorCallback: (editor: unknown) => {
        const ed = editor as { getSelection?: () => string };
        const selected = ed.getSelection?.() ?? '';
        void this.triggerSyncOne(selected);
      },
    });

    this.addCommand({
      id: 'test-connection',
      name: 'Müslidian: Test connection',
      callback: () => void this.testConnection(),
    });

    // ── Settings tab ────────────────────────────────────────────────────────
    this.addSettingTab(new MueslidianSettingTab(this.app, this));

    // ── Status bar ──────────────────────────────────────────────────────────
    const item = this.addStatusBarItem();
    this.statusBarEl = item as unknown as { setText(s: string): void };
    const itemEl = item as unknown as { setText(s: string): void; onclick: ((ev?: Event) => void) | null };
    itemEl.onclick = () => {
      if (this.state.lastSyncReport) {
        showSyncReport(this.app, this.state.lastSyncReport, this.settings);
      } else {
        emitNotice('Müslidian: no sync run yet');
      }
    };
    this.refreshStatusBar();
    // Re-render every 30 s so relative-time strings advance.
    this.statusBarIntervalId = window.setInterval(() => this.refreshStatusBar(), 30_000);
    this.registerInterval(this.statusBarIntervalId);

    // ── Periodic timer ─────────────────────────────────────────────────────
    this.applyPeriodicSchedule();

    // ── Catch-up on load (FR44, injectable delayFn) ─────────────────────────
    // Fire-and-forget; the 60s delay is non-blocking.
    void scheduleCatchUp({
      lastSyncAt: this.state.lastSyncAt,
      periodicIntervalMinutes: this.settings.periodicIntervalMinutes,
      runSync: () => this.triggerSyncNow('periodic'),
    });
  }

  onunload(): void {
    this.periodicHandle?.cancel();
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ settings: this.settings, state: this.state });
    this.applyPeriodicSchedule();
  }

  /** R41: persist state + last report to data.json. */
  async persistState(): Promise<void> {
    await this.saveData({ settings: this.settings, state: this.state });
  }

  async triggerSyncNow(trigger: 'manual' | 'periodic' = 'manual'): Promise<void> {
    this.statusState = 'syncing';
    this.refreshStatusBar();
    try {
      const client = new GranolaClient(this.settings.apiKey, requestUrlTransport);
      const report = await syncAll(this.app, this.settings, this.state, client, (n, total) => {
        this.setStatusText(`Müslidian: syncing ${n}/${total}`);
      });
      this.statusState = report.aborted ? 'error' : 'idle';
      notifyOnReport(report, trigger);
    } catch (err) {
      this.statusState = 'error';
      emitNotice(`Müslidian: sync failed (${(err as Error).message})`);
    } finally {
      await this.persistState();
      this.refreshStatusBar();
    }
  }

  async triggerSyncOne(input: string): Promise<void> {
    if (!input.trim()) {
      emitNotice('Müslidian: paste a Granola note ID or URL into the editor selection first');
      return;
    }
    this.statusState = 'syncing';
    this.refreshStatusBar();
    try {
      const client = new GranolaClient(this.settings.apiKey, requestUrlTransport);
      const result = await syncOne(this.app, this.settings, this.state, client, input);
      this.statusState = 'idle';
      emitNotice(`Müslidian: ${result.written ? 'wrote' : 'skipped'} note`);
    } catch (err) {
      this.statusState = 'error';
      emitNotice(`Müslidian: ${(err as Error).message}`);
    } finally {
      await this.persistState();
      this.refreshStatusBar();
    }
  }

  async testConnection(): Promise<void> {
    try {
      const client = new GranolaClient(this.settings.apiKey, requestUrlTransport);
      // listNotes with no params; succeed = API key works
      await client.listNotes({});
      emitNotice('Müslidian: connection OK');
    } catch (err) {
      emitNotice(`Müslidian: ${(err as Error).message}`);
    }
  }

  async clearFilteredOutCache(): Promise<void> {
    this.state.filteredOut = {};
    await this.persistState();
    emitNotice('Müslidian: filtered-out cache cleared');
  }

  viewLastSyncReport(): void {
    if (this.state.lastSyncReport) {
      showSyncReport(this.app, this.state.lastSyncReport, this.settings);
    } else {
      emitNotice('Müslidian: no sync run yet');
    }
  }

  private applyPeriodicSchedule(): void {
    this.periodicHandle?.cancel();
    this.periodicHandle = null;
    if (this.settings.periodicIntervalMinutes <= 0) return;
    this.periodicHandle = startPeriodicSync({
      schedulerFn: (cb, ms) => window.setInterval(cb, ms),
      clearFn: (id) => window.clearInterval(id),
      runSync: () => this.triggerSyncNow('periodic'),
      periodicIntervalMinutes: this.settings.periodicIntervalMinutes,
    });
  }

  private setStatusText(text: string): void {
    this.statusBarEl?.setText(text);
  }

  private refreshStatusBar(): void {
    if (!this.statusBarEl) return;
    if (this.statusState === 'syncing') return; // text set by progress callback
    if (this.statusState === 'error') {
      this.statusBarEl.setText('Müslidian: error');
      return;
    }
    this.statusBarEl.setText(`Müslidian: ${formatRelativeTime(this.state.lastSyncAt)}`);
  }
}
