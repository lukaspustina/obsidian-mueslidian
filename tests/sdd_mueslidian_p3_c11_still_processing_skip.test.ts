import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, Note, MuesliState } from '../src/types';
import { syncAll } from '../src/sync';

const note: Note = {
  id: 'not_x0000000000000',
  object: 'note',
  title: 'Still Processing',
  owner: { name: 'Alice', email: 'alice@example.com' },
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T11:00:00Z',
};

describe('TS3.11 — Still-processing skip', () => {
  it('skips note with 404 getNote: stillProcessing === 1, no errors, no vault.create, aborted === null', async () => {
    const createSpy = vi.fn();
    const app: any = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (_p: string) => null,
        create: createSpy,
        read: vi.fn(),
        modify: vi.fn(),
        delete: vi.fn(),
        adapter: { exists: async (_p: string) => false, mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: { getFileCache: (_f: any) => null },
    };

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes(`/notes/${note.id}`)) {
        return { status: 404, body: {} };
      }
      if (url.includes('/notes')) {
        return {
          status: 200,
          body: { notes: [note], hasMore: false, cursor: null },
        };
      }
      return { status: 404, body: {} };
    });

    const client = new GranolaClient('grn_testkey', transport);
    const settings = { ...DEFAULT_SETTINGS, allowedFolders: [] };
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const report = await syncAll(app, settings, state, client);

    expect(report.stillProcessing).toBe(1);
    expect(report.errors).toHaveLength(0);
    expect(createSpy).not.toHaveBeenCalled();
    expect(report.aborted).toBeNull();
  });
});
