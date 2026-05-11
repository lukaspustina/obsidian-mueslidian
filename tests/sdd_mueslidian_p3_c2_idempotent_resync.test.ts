import { describe, it, expect, vi } from 'vitest';
import { syncAll } from '../src/sync';
import { GranolaClient } from '../src/granola';
import type { HttpTransport, MuesliSettings, MuesliState } from '../src/types';

vi.mock('obsidian');

const defaultSettings: MuesliSettings = {
  apiKey: 'grn_test',
  syncDirectory: 'Besprechungen',
  personFolder: 'Personen',
  allowedFolders: [],
  earliestCreationDate: null,
  documentSyncLimit: 0,
  periodicIntervalMinutes: 0,
  skipExistingNotes: false,
  filenameTemplate: '{date} {title}',
  filenameDateFormat: 'DD.MM.YYYY',
  includeMyNotesPlaceholder: true,
  includeEnhancedNotes: true,
  includeTranscript: true,
  bodyDateFormat: 'local',
  bodyTimeZone: 'local',
  myName: '',
  attendeeTagTemplate: 'person/{name}',
  additionalFrontmatter: '',
};

// Three notes already synced into the vault with matching updated_at values
const listedNotes = [
  {
    id: 'not_aaaaaaaaaaaaaa',
    object: 'note' as const,
    title: 'Meeting A',
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: '2026-01-10T09:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'not_bbbbbbbbbbbbbb',
    object: 'note' as const,
    title: 'Meeting B',
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: '2026-01-11T09:00:00Z',
    updated_at: '2026-01-11T10:00:00Z',
  },
  {
    id: 'not_cccccccccccccc',
    object: 'note' as const,
    title: 'Meeting C',
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: '2026-01-12T09:00:00Z',
    updated_at: '2026-01-12T10:00:00Z',
  },
];

describe('TS3.2 — Idempotent re-sync (warm cache)', () => {
  it('writes 0 files, calls getNote 0 times, reports unchanged: 3', async () => {
    // Existing vault files with frontmatter matching the listed notes exactly
    const existingFiles = [
      { path: 'Besprechungen/file1.md', basename: 'file1', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 }, vault: null, parent: null, name: 'file1.md' },
      { path: 'Besprechungen/file2.md', basename: 'file2', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 }, vault: null, parent: null, name: 'file2.md' },
      { path: 'Besprechungen/file3.md', basename: 'file3', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 }, vault: null, parent: null, name: 'file3.md' },
    ];

    const fileCacheMap: Record<string, { frontmatter: Record<string, string> }> = {
      'Besprechungen/file1.md': { frontmatter: { granola_id: 'not_aaaaaaaaaaaaaa', granola_updated_at: '2026-01-10T10:00:00Z' } },
      'Besprechungen/file2.md': { frontmatter: { granola_id: 'not_bbbbbbbbbbbbbb', granola_updated_at: '2026-01-11T10:00:00Z' } },
      'Besprechungen/file3.md': { frontmatter: { granola_id: 'not_cccccccccccccc', granola_updated_at: '2026-01-12T10:00:00Z' } },
    };

    const writtenFiles: Record<string, string> = {};
    const vaultCreate = vi.fn(async (path: string, content: string) => { writtenFiles[path] = content; return {} as never; });
    const vaultModify = vi.fn(async (file: unknown, content: string) => { writtenFiles[(file as { path: string }).path] = content; });

    const app = {
      vault: {
        getMarkdownFiles: () => existingFiles,
        read: vi.fn(async (file: { path: string }) => ''),
        create: vaultCreate,
        modify: vaultModify,
        adapter: {
          exists: vi.fn(async () => true),
        },
      },
      metadataCache: {
        getFileCache: (file: { path: string }) => fileCacheMap[file.path] ?? null,
      },
    } as unknown as Parameters<typeof syncAll>[0];

    // Spy transport: count getNote calls separately from listNotes
    const getNoteCalls = vi.fn();

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes('/notes/not_')) {
        // This is a getNote call — should NOT happen in idempotent re-sync
        getNoteCalls(url);
        return { status: 200, body: {} };
      }
      // listNotes — return all 3 notes with same updated_at
      return {
        status: 200,
        body: {
          notes: listedNotes,
          hasMore: false,
          cursor: null,
        },
      };
    });

    const client = new GranolaClient('grn_test', transport);

    // Warm state: filteredOut is empty (no cache clear), prior sync already ran
    const state: MuesliState = {
      lastSyncAt: '2026-01-12T11:00:00Z',
      filteredOut: {},
      lastSyncReport: null,
    };

    const report = await syncAll(app, defaultSettings, state, client);

    // Zero getNote calls — all notes are unchanged
    expect(getNoteCalls.mock.calls.length).toBe(0);

    // Zero file writes
    expect(vaultCreate).not.toHaveBeenCalled();
    expect(vaultModify).not.toHaveBeenCalled();

    // Report reflects all 3 as unchanged
    expect(report.created).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.unchanged).toBe(3);
  });
});
