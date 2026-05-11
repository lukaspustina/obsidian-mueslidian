import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, Note, NoteWithBody, MuesliState } from '../src/types';
import { syncAll } from '../src/sync';

const NOTE_ID = 'not_x_skipexisting1' as const;

const listedNote: Note = {
  id: NOTE_ID,
  object: 'note',
  title: 'Existing Meeting',
  owner: { name: 'Alice', email: 'alice@example.com' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

const noteWithChangedBody: NoteWithBody = {
  ...listedNote,
  web_url: `https://app.granola.ai/notes/${NOTE_ID}`,
  calendar_event: null,
  attendees: [],
  folder_membership: [],
  summary_text: 'Changed summary',
  summary_markdown: '# Changed\n\nThis content was modified.',
  transcript: null,
};

describe('TS4.7 — Skip-existing mode', () => {
  it('leaves existing file byte-identical, skippedExisting=1, updated=0, getNote not called', async () => {
    const writtenFiles: Record<string, string> = { 'Besprechungen/foo.md': 'ORIGINAL' };
    const tfile = { path: 'Besprechungen/foo.md' };
    const app: any = {
      vault: {
        getMarkdownFiles: () => [tfile],
        getAbstractFileByPath: (p: string) => p === tfile.path ? tfile : null,
        create: vi.fn(),
        read: vi.fn(async () => writtenFiles[tfile.path]),
        modify: vi.fn(async (f: any, c: string) => { writtenFiles[f.path] = c; }),
        delete: vi.fn(),
        adapter: { exists: async (p: string) => !!writtenFiles[p], mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: {
        getFileCache: (_f: any) => ({
          frontmatter: {
            granola_id: NOTE_ID,
            granola_updated_at: '2026-01-01T00:00:00Z',
          },
        }),
      },
    };

    const getNotespy = vi.fn(async (_id: string, _opts: unknown): Promise<NoteWithBody> => noteWithChangedBody);

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes(`/notes/${NOTE_ID}`)) {
        return { status: 200, body: noteWithChangedBody };
      }
      if (url.includes('/notes')) {
        return {
          status: 200,
          body: { notes: [listedNote], hasMore: false, cursor: null },
        };
      }
      return { status: 404, body: {} };
    });

    const client = new GranolaClient('grn_testkey', transport);
    // Spy on getNote at the instance level
    vi.spyOn(client, 'getNote').mockImplementation(getNotespy);

    const settings = { ...DEFAULT_SETTINGS, skipExistingNotes: true, allowedFolders: [] };
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const report = await syncAll(app, settings, state, client);

    expect(writtenFiles['Besprechungen/foo.md']).toBe('ORIGINAL');
    expect(report.skippedExisting).toBe(1);
    expect(report.updated).toBe(0);
    expect(getNotespy).not.toHaveBeenCalled();
  });
});
