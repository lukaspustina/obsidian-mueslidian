import { describe, it, expect, vi } from 'vitest';
import { scheduleCatchUp, shouldCatchUp } from '../src/main';
import { hasMyNotesOutsideMarkers } from '../src/merge';
import { syncAll } from '../src/sync';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type {
  HttpTransport,
  MuesliSettings,
  MuesliState,
  Note,
  NoteWithBody,
} from '../src/types';

vi.mock('obsidian');

const settings: MuesliSettings = { ...DEFAULT_SETTINGS };

function note(
  id: string,
  dateIso = '2026-01-01T00:00:00Z',
  title: string = 'T',
): NoteWithBody {
  return {
    id: id as never,
    object: 'note',
    title,
    owner: { name: 'A', email: 'a@example.com' },
    created_at: dateIso,
    updated_at: dateIso,
    web_url: `https://granola.ai/notes/${id}`,
    calendar_event: null,
    attendees: [],
    folder_membership: [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
  };
}

// ─── R43/R44: injectable delayFn for catch-up ───────────────────────────────

describe('scheduleCatchUp (R44 — injectable delayFn)', () => {
  it('returns false (no-op) when shouldCatchUp is false', async () => {
    const delayFn = vi.fn(async () => {});
    const runSync = vi.fn(async () => {});
    const result = await scheduleCatchUp({
      lastSyncAt: new Date().toISOString(),
      periodicIntervalMinutes: 60,
      runSync,
      delayFn,
      nowMs: Date.now(),
    });
    expect(result).toBe(false);
    expect(delayFn).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
  });

  it('awaits delayFn then calls runSync when shouldCatchUp is true', async () => {
    const order: string[] = [];
    const delayFn = vi.fn(async (ms: number) => {
      order.push(`delay(${ms})`);
    });
    const runSync = vi.fn(async () => {
      order.push('runSync');
    });
    const now = 1_700_000_000_000;
    const result = await scheduleCatchUp({
      lastSyncAt: new Date(now - 120 * 60_000).toISOString(),
      periodicIntervalMinutes: 60,
      runSync,
      delayFn,
      nowMs: now,
    });
    expect(result).toBe(true);
    expect(delayFn).toHaveBeenCalledWith(60_000);
    expect(runSync).toHaveBeenCalledOnce();
    expect(order).toEqual(['delay(60000)', 'runSync']);
  });
});

// ─── R11: My Notes duplicate guard ──────────────────────────────────────────

describe('hasMyNotesOutsideMarkers (R11)', () => {
  it('returns false when the body has no `## My Notes` at all', () => {
    expect(hasMyNotesOutsideMarkers('# Header\n\nbody text')).toBe(false);
  });

  it('returns false when `## My Notes` only appears INSIDE a marker block', () => {
    const body =
      '<!-- granola:enhanced:start -->\n' +
      '## My Notes\nsomething inside\n' +
      '<!-- granola:enhanced:end -->\n';
    expect(hasMyNotesOutsideMarkers(body)).toBe(false);
  });

  it('returns true when `## My Notes` appears between marker blocks', () => {
    const body =
      '<!-- granola:enhanced:start -->\nblock\n<!-- granola:enhanced:end -->\n' +
      '## My Notes\n\nuser text\n' +
      '<!-- granola:transcript:start -->\nT\n<!-- granola:transcript:end -->\n';
    expect(hasMyNotesOutsideMarkers(body)).toBe(true);
  });

  it('returns true when `## My Notes` appears at the top of an unmarkered file', () => {
    expect(hasMyNotesOutsideMarkers('## My Notes\n\nstuff')).toBe(true);
  });
});

// ─── Network vs list_failed abort variant ───────────────────────────────────

describe("syncAll aborts: 'network' vs 'list_failed'", () => {
  function fakeApp() {
    return {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: () => null,
        create: vi.fn(),
        read: vi.fn(),
        modify: vi.fn(),
        delete: vi.fn(),
        adapter: { exists: async () => false, mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: { getFileCache: () => null },
    } as unknown as never;
  }

  it("first-page network failure aborts with 'network'", async () => {
    const transport: HttpTransport = vi.fn(async () => {
      const err = new Error('fetch failed: ENETUNREACH');
      throw err;
    });
    const client = new GranolaClient('grn_x', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };
    const report = await syncAll(fakeApp(), settings, state, client);
    expect(report.aborted).toBe('network');
  });

  it("first-page non-network failure aborts with 'list_failed'", async () => {
    const transport: HttpTransport = vi.fn(async () => {
      throw new Error('something went wrong');
    });
    const client = new GranolaClient('grn_x', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };
    const report = await syncAll(fakeApp(), settings, state, client);
    expect(report.aborted).toBe('list_failed');
  });
});

// ─── Per-note fs-write try/catch ────────────────────────────────────────────

describe('writeNote per-note error handling', () => {
  it('records a write failure as a per-note error and continues with remaining notes', async () => {
    const writtenFiles: Record<string, string> = {};
    let createCallCount = 0;
    const app = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: () => null,
        create: vi.fn(async (p: string, c: string) => {
          createCallCount++;
          if (p.includes('badfile')) throw new Error('ENOSPC: disk full');
          writtenFiles[p] = c;
          return { path: p };
        }),
        read: vi.fn(),
        modify: vi.fn(),
        delete: vi.fn(),
        adapter: { exists: async () => false, mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: { getFileCache: () => null },
    } as unknown as never;

    const listed: Note[] = [
      {
        id: 'not_writeok000001' as never,
        object: 'note',
        title: 'OK',
        owner: { name: 'A', email: 'a@example.com' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'not_writebad00001' as never,
        object: 'note',
        title: 'bad',
        owner: { name: 'A', email: 'a@example.com' },
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 'not_writeok000002' as never,
        object: 'note',
        title: 'OK2',
        owner: { name: 'A', email: 'a@example.com' },
        created_at: '2026-01-03T00:00:00Z',
        updated_at: '2026-01-03T00:00:00Z',
      },
    ];

    const titleById: Record<string, string> = {
      not_writeok000001: 'OK',
      not_writebad00001: 'badfile',
      not_writeok000002: 'OK2',
    };
    const transport: HttpTransport = vi.fn(async (url: string) => {
      const m = url.match(/\/notes\/(not_[a-zA-Z0-9]+)/);
      if (m) {
        return { status: 200, body: note(m[1], '2026-01-01T00:00:00Z', titleById[m[1]]) };
      }
      return { status: 200, body: { notes: listed, hasMore: false, cursor: null } };
    });

    const client = new GranolaClient('grn_x', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const report = await syncAll(app, settings, state, client);

    // Sync did not abort
    expect(report.aborted).toBe(null);
    // The bad write surfaced as a per-note error
    expect(report.errors.length).toBe(1);
    expect(report.errors[0].id).toBe('not_writebad00001');
    // The two good writes succeeded
    expect(report.created).toBe(2);
  });
});
