import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, Note, MuesliState } from '../src/types';
import { syncAll } from '../src/sync';

const notes: Note[] = [
  {
    id: 'not_aaaaaaaaaaaa01',
    object: 'note',
    title: 'Meeting A',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T11:00:00Z',
  },
  {
    id: 'not_bbbbbbbbbbbb02',
    object: 'note',
    title: 'Meeting B',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-02T10:00:00Z',
    updated_at: '2026-01-02T11:00:00Z',
  },
  {
    id: 'not_cccccccccccc03',
    object: 'note',
    title: 'Meeting C',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-03T10:00:00Z',
    updated_at: '2026-01-03T11:00:00Z',
  },
  {
    id: 'not_dddddddddddd04',
    object: 'note',
    title: 'Meeting D',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-04T10:00:00Z',
    updated_at: '2026-01-04T11:00:00Z',
  },
  {
    id: 'not_eeeeeeeeeeee05',
    object: 'note',
    title: 'Meeting E',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-05T10:00:00Z',
    updated_at: '2026-01-05T11:00:00Z',
  },
  {
    id: 'not_ffffffffffff06',
    object: 'note',
    title: 'Meeting F',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-06T10:00:00Z',
    updated_at: '2026-01-06T11:00:00Z',
  },
];

describe('TS3.12 — Circuit breaker', () => {
  it('aborts after 5 consecutive 500 errors; report.aborted === api_unhealthy; getNote called exactly 5 times; no files written', async () => {
    const writtenFiles: Record<string, string> = {};
    const app: any = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (_p: string) => null,
        create: vi.fn(async (p: string, content: string) => { writtenFiles[p] = content; return { path: p }; }),
        read: vi.fn(async (f: any) => writtenFiles[f.path]),
        modify: vi.fn(async (f: any, c: string) => { writtenFiles[f.path] = c; }),
        delete: vi.fn(async (f: any) => { delete writtenFiles[f.path]; }),
        adapter: { exists: async (p: string) => !!writtenFiles[p], mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: { getFileCache: (_f: any) => null },
    };

    const getNoteCallCount = { value: 0 };

    const transport: HttpTransport = vi.fn(async (url: string) => {
      // list endpoint
      if (!url.match(/\/notes\/not_/)) {
        return {
          status: 200,
          body: { notes, hasMore: false, cursor: null },
        };
      }
      // getNote — always return 500
      getNoteCallCount.value++;
      return { status: 500, body: {} };
    });

    const client = new GranolaClient('grn_testkey', transport);
    const settings = { ...DEFAULT_SETTINGS, allowedFolders: [] };
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const report = await syncAll(app, settings, state, client);

    expect(report.aborted).toBe('api_unhealthy');
    expect(getNoteCallCount.value).toBe(5);
    expect(Object.keys(writtenFiles)).toHaveLength(0);
    expect(report.errors.length).toBeGreaterThan(0);
  });
});
