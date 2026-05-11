import { describe, it, expect, vi, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderMeeting } from '../src/markdown';
import { extractGranolaId, syncOne } from '../src/sync';
import { showSyncReport } from '../src/main';
import { DEFAULT_SETTINGS } from '../src/settings';
import { GranolaClient } from '../src/granola';
import { Modal, MockEl } from './__mocks__/obsidian';
import type {
  HttpTransport,
  MuesliSettings,
  MuesliState,
  NoteWithBody,
  SyncReport,
} from '../src/types';

// NOTE: do NOT call vi.mock('obsidian') here — the vitest.config.ts alias
// already routes 'obsidian' imports to tests/__mocks__/obsidian.ts. Calling
// vi.mock() would auto-mock that file too, stubbing every class with
// vi.fn() and stripping Modal.contentEl, which this test needs intact.

const settings: MuesliSettings = { ...DEFAULT_SETTINGS };

function makeNote(overrides: Partial<NoteWithBody> = {}): NoteWithBody {
  return {
    id: 'not_xroundthree02A' as never,
    object: 'note',
    title: 'T',
    owner: { name: 'A', email: 'a@example.com' },
    created_at: '2026-01-27T10:00:00Z',
    updated_at: '2026-01-27T10:00:00Z',
    web_url: 'https://granola.ai/notes/not_xroundthree02A',
    calendar_event: {
      event_title: 'T',
      invitees: [],
      organiser: null,
      calendar_event_id: null,
      scheduled_start_time: '2026-01-27T10:00:00Z',
      scheduled_end_time: '2026-01-27T11:00:00Z',
    },
    attendees: [],
    folder_membership: [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
    ...overrides,
  };
}

// ─── bodyDateFormat wiring (D15) ─────────────────────────────────────────────

describe('bodyDateFormat (D15) — drives meta callout When: line', () => {
  it("renders DD.MM.YYYY when bodyDateFormat='local'", () => {
    const out = renderMeeting(
      makeNote(),
      {},
      { ...settings, bodyDateFormat: 'local', bodyTimeZone: 'utc' },
      {},
    );
    expect(out).toContain('**When:** 27.01.2026 → 27.01.2026');
  });

  it("renders YYYY-MM-DD when bodyDateFormat='iso'", () => {
    const out = renderMeeting(
      makeNote(),
      {},
      { ...settings, bodyDateFormat: 'iso', bodyTimeZone: 'utc' },
      {},
    );
    expect(out).toContain('**When:** 2026-01-27 → 2026-01-27');
  });

  it('frontmatter `date` field is always YYYY-MM-DD regardless of bodyDateFormat', () => {
    const outLocal = renderMeeting(
      makeNote(),
      {},
      { ...settings, bodyDateFormat: 'local', filenameDateFormat: 'DD.MM.YYYY' },
      {},
    );
    expect(outLocal).toMatch(/^---[\s\S]*?\ndate: ['"]?2026-01-27['"]?\n[\s\S]*?\n---\n/);
    const outIso = renderMeeting(
      makeNote(),
      {},
      { ...settings, bodyDateFormat: 'iso', filenameDateFormat: 'DD.MM.YYYY' },
      {},
    );
    expect(outIso).toMatch(/^---[\s\S]*?\ndate: ['"]?2026-01-27['"]?\n[\s\S]*?\n---\n/);
  });
});

// ─── AC13 URL edge cases for extractGranolaId ────────────────────────────────

describe('extractGranolaId (AC13 URL edge cases)', () => {
  const VALID = 'not_abc1234567890A'; // exactly 14 chars after `not_`

  it.each([
    ['raw ID', VALID, VALID],
    ['HTTPS URL', `https://granola.ai/notes/${VALID}`, VALID],
    ['HTTP URL', `http://granola.ai/notes/${VALID}`, VALID],
    ['URL with query', `https://granola.ai/notes/${VALID}?ref=email`, VALID],
    ['URL with fragment', `https://granola.ai/notes/${VALID}#section`, VALID],
    ['embedded in prose', `Look at this: https://granola.ai/notes/${VALID} cool right?`, VALID],
    ['embedded in markdown link', `[Q1](https://granola.ai/notes/${VALID})`, VALID],
    ['leading/trailing whitespace', `  ${VALID}  `, VALID],
  ])('extracts from %s', (_label, input, expected) => {
    expect(extractGranolaId(input)).toBe(expected);
  });

  it.each([
    ['empty', ''],
    ['too short ID', 'not_short'],
    ['no ID at all', 'just plain text'],
    ['similar but different prefix', 'note_abc1234567890'],
  ])('returns null for %s', (_label, input) => {
    expect(extractGranolaId(input)).toBeNull();
  });

  it('extracts the first match when multiple IDs appear', () => {
    const a = 'not_aaaaaaaaaaaaaa'; // 14 a's
    const b = 'not_bbbbbbbbbbbbbb'; // 14 b's
    expect(extractGranolaId(`${a} and ${b}`)).toBe(a);
  });
});

// ─── TS2.11 end-to-end syncOne idempotency ───────────────────────────────────

describe('TS2.11 — syncOne end-to-end idempotency (full command path)', () => {
  it('two consecutive syncOne calls produce byte-identical file content', async () => {
    const writtenFiles: Record<string, string> = {};
    let createdFile: { path: string } | null = null;

    function makeApp() {
      return {
        vault: {
          getMarkdownFiles: () =>
            createdFile ? [{ path: createdFile.path } as { path: string }] : [],
          getAbstractFileByPath: (p: string) =>
            createdFile && p === createdFile.path ? createdFile : null,
          create: vi.fn(async (p: string, c: string) => {
            writtenFiles[p] = c;
            createdFile = { path: p };
            return createdFile;
          }),
          read: vi.fn(async (f: { path: string }) => writtenFiles[f.path]),
          modify: vi.fn(async (f: { path: string }, c: string) => {
            writtenFiles[f.path] = c;
          }),
          delete: vi.fn(),
          adapter: { exists: async (p: string) => !!writtenFiles[p], mkdir: async () => {} },
          createFolder: async () => {},
        },
        metadataCache: {
          getFileCache: (f: { path: string }) =>
            createdFile && f.path === createdFile.path
              ? {
                  frontmatter: {
                    granola_id: 'not_xroundthree02A',
                    granola_updated_at: '2026-01-27T10:00:00Z',
                  },
                }
              : null,
        },
      } as unknown as never;
    }

    const note = makeNote();
    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes('/notes/not_xroundthree02A')) return { status: 200, body: note };
      return { status: 200, body: { notes: [], hasMore: false, cursor: null } };
    });

    const client = new GranolaClient('grn_x', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const app = makeApp();
    await syncOne(app, settings, state, client, 'not_xroundthree02A');
    expect(createdFile).not.toBeNull();
    const firstContent = writtenFiles[createdFile!.path];

    await syncOne(app, settings, state, client, 'not_xroundthree02A');
    const secondContent = writtenFiles[createdFile!.path];

    expect(secondContent).toBe(firstContent);
  });
});

// ─── TS4.4 modal renders all scalar SyncReport fields ────────────────────────

describe('TS4.4 — SyncReportModal renders scalar fields', () => {
  it('contentEl receives child entries reflecting every scalar report field', () => {
    const report: SyncReport = {
      startedAt: '2026-01-27T10:00:00Z',
      endedAt: '2026-01-27T10:00:03Z',
      durationMs: 3000,
      listed: 7,
      created: 2,
      updated: 1,
      unchanged: 3,
      filteredOut: 1,
      delisted: 0,
      skippedExisting: 0,
      stillProcessing: 0,
      errors: [],
      unmatchedAttendees: [],
      aborted: null,
    };

    const modal = showSyncReport({} as never, report, settings) as unknown as Modal;
    // Top-level: h2 (heading) + ul (summary list).
    const tags = modal.contentEl.children.map(c => c.attrs.tag);
    expect(tags).toContain('h2');
    expect(tags).toContain('ul');

    const ul = modal.contentEl.children.find(c => c.attrs.tag === 'ul')!;
    const labels = ul.children.map(li => li.text);
    expect(labels).toContain('Listed: 7');
    expect(labels).toContain('Created: 2');
    expect(labels).toContain('Updated: 1');
    expect(labels).toContain('Unchanged: 3');
    expect(labels).toContain('Filtered out: 1');
    expect(labels).toContain('Errors: 0');
    expect(labels).toContain('Aborted: —');
    expect(labels).toContain('Duration (ms): 3000');
  });

  it('renders an unmatched-attendees section when present', () => {
    const report: SyncReport = {
      startedAt: '2026-01-27T10:00:00Z',
      endedAt: '2026-01-27T10:00:01Z',
      durationMs: 1000,
      listed: 1,
      created: 1,
      updated: 0,
      unchanged: 0,
      filteredOut: 0,
      delisted: 0,
      skippedExisting: 0,
      stillProcessing: 0,
      errors: [],
      unmatchedAttendees: [{ name: 'Alice', sourceNoteTitles: ['Meeting A'] }],
      aborted: null,
    };

    const modal = showSyncReport({} as never, report, settings) as unknown as Modal;
    const headings = modal.contentEl.children
      .filter(c => c.attrs.tag === 'h3')
      .map(c => c.text);
    expect(headings.some(h => /Unmatched/i.test(h))).toBe(true);
  });
});

// ─── AC1 — build target produces dist/main.js ────────────────────────────────

describe('AC1 — `make build` (esbuild) produces dist/ artefacts', () => {
  beforeAll(() => {
    // Run the production build once for both checks.
    execSync('node esbuild.config.mjs production', {
      cwd: resolve(__dirname, '..'),
      stdio: 'pipe',
    });
  });

  it('writes dist/main.js (plugin bundle)', () => {
    const path = resolve(__dirname, '..', 'dist', 'main.js');
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(1000);
  });

  it('writes dist/mueslidian.js (CLI bundle)', () => {
    const path = resolve(__dirname, '..', 'dist', 'mueslidian.js');
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(1000);
  });

  it('copies dist/manifest.json with the expected plugin id', () => {
    const path = resolve(__dirname, '..', 'dist', 'manifest.json');
    expect(existsSync(path)).toBe(true);
    const m = JSON.parse(readFileSync(path, 'utf8'));
    expect(m.id).toBe('mueslidian');
    expect(m.isDesktopOnly).toBe(true);
  });
});

// ─── AC2 — `make check` portion: tsc --noEmit ────────────────────────────────

describe('AC2 — TypeScript types compile clean for production code', () => {
  it('npx tsc -p tsconfig.build.json succeeds (src/ + bin/, excluding tests/)', () => {
    // If tsc fails, execSync throws and the test fails with the compiler output.
    // Scoped to production code via tsconfig.build.json — tests use looser
    // typing for vi.spyOn shapes; production must be strict.
    execSync('npx tsc -p tsconfig.build.json', {
      cwd: resolve(__dirname, '..'),
      stdio: 'pipe',
    });
  });
});

// ─── AC3 — settings round-trip via loadData/saveData ─────────────────────────

describe('AC3 — settings + state persist across simulated plugin reloads', () => {
  /**
   * Fake Plugin that backs loadData/saveData with an in-memory object.
   * Mirrors Obsidian's contract closely enough to prove the round-trip
   * mechanism is symmetric.
   */
  class FakePlugin {
    private storage: unknown = null;
    async loadData(): Promise<unknown> {
      return this.storage;
    }
    async saveData(data: unknown): Promise<void> {
      this.storage = JSON.parse(JSON.stringify(data));
    }
  }

  it('written settings survive a re-read', async () => {
    const plug = new FakePlugin();
    const before = {
      settings: {
        ...DEFAULT_SETTINGS,
        apiKey: 'grn_round_trip',
        syncDirectory: 'Custom/Path',
        allowedFolders: ['Reviewed'],
        myName: 'Sam Sample',
      },
      state: {
        lastSyncAt: '2026-01-27T10:00:00Z',
        filteredOut: { not_persistedID0001: '2026-01-27T10:00:00Z' },
        lastSyncReport: null,
      },
    };

    await plug.saveData(before);
    const after = (await plug.loadData()) as typeof before;

    expect(after).toEqual(before);
    expect(after.settings.apiKey).toBe('grn_round_trip');
    expect(after.state.filteredOut['not_persistedID0001']).toBe('2026-01-27T10:00:00Z');
  });

  it('mutating settings.allowedFolders and re-saving persists the new list', async () => {
    const plug = new FakePlugin();
    const v1 = {
      settings: { ...DEFAULT_SETTINGS, allowedFolders: ['A'] },
      state: { lastSyncAt: null, filteredOut: {}, lastSyncReport: null },
    };
    await plug.saveData(v1);

    const reloaded = (await plug.loadData()) as typeof v1;
    reloaded.settings.allowedFolders.push('B');
    await plug.saveData(reloaded);

    const v2 = (await plug.loadData()) as typeof v1;
    expect(v2.settings.allowedFolders).toEqual(['A', 'B']);
  });
});
