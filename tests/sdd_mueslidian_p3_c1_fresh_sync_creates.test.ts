import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, Note, NoteWithBody, MuesliState } from '../src/types';
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
];

function makeNoteWithBody(note: Note): NoteWithBody {
  return {
    ...note,
    web_url: `https://app.granola.ai/notes/${note.id}`,
    calendar_event: null,
    attendees: [],
    folder_membership: [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
  };
}

describe('TS3.1 — Fresh sync creates files', () => {
  it('creates 3 files and returns { created: 3, updated: 0, unchanged: 0, errors: [] }', async () => {
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

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes('/notes/not_aaaaaaaaaaaa01')) {
        return { status: 200, body: makeNoteWithBody(notes[0]) };
      }
      if (url.includes('/notes/not_bbbbbbbbbbbb02')) {
        return { status: 200, body: makeNoteWithBody(notes[1]) };
      }
      if (url.includes('/notes/not_cccccccccccc03')) {
        return { status: 200, body: makeNoteWithBody(notes[2]) };
      }
      if (url.includes('/notes')) {
        return {
          status: 200,
          body: { notes, hasMore: false, cursor: null },
        };
      }
      return { status: 404, body: {} };
    });

    const client = new GranolaClient('grn_testkey', transport);
    const settings = { ...DEFAULT_SETTINGS, allowedFolders: [] };
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const report = await syncAll(app, settings, state, client);

    expect(report.created).toBe(3);
    expect(report.updated).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.errors).toHaveLength(0);
    expect(Object.keys(writtenFiles)).toHaveLength(3);
  });
});
