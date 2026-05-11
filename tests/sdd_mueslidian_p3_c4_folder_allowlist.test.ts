import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, Note, NoteWithBody, MuesliState } from '../src/types';
import { syncAll } from '../src/sync';

// 4 list-metadata entries
const notes: Note[] = [
  {
    id: 'not_reviewed000001',
    object: 'note',
    title: 'Reviewed A',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T11:00:00Z',
  },
  {
    id: 'not_reviewed000002',
    object: 'note',
    title: 'Reviewed B',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-02T10:00:00Z',
    updated_at: '2026-01-02T11:00:00Z',
  },
  {
    id: 'not_draftsFolder03',
    object: 'note',
    title: 'Drafts Note',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-03T10:00:00Z',
    updated_at: '2026-01-03T11:00:00Z',
  },
  {
    id: 'not_emptyFolders4',
    object: 'note',
    title: 'No Folder',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-04T10:00:00Z',
    updated_at: '2026-01-04T11:00:00Z',
  },
];

function makeNoteWithBody(note: Note, folderName: string | null): NoteWithBody {
  return {
    ...note,
    web_url: `https://app.granola.ai/notes/${note.id}`,
    calendar_event: null,
    attendees: [],
    folder_membership: folderName
      ? [{ id: 'fol_abc', object: 'folder', name: folderName, parent_folder_id: null }]
      : [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
  };
}

describe('TS3.4 — Folder allowlist filtering', () => {
  it('creates 2 files; 2 non-matching IDs in filteredOut; report.created===2 report.filteredOut===2', async () => {
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
      // getNote calls — return appropriate folder_membership per ID
      if (url.includes('/notes/not_reviewed000001')) {
        return { status: 200, body: makeNoteWithBody(notes[0], 'Reviewed') };
      }
      if (url.includes('/notes/not_reviewed000002')) {
        return { status: 200, body: makeNoteWithBody(notes[1], 'Reviewed') };
      }
      if (url.includes('/notes/not_draftsFolder03')) {
        return { status: 200, body: makeNoteWithBody(notes[2], 'Drafts') };
      }
      if (url.includes('/notes/not_emptyFolders4')) {
        return { status: 200, body: makeNoteWithBody(notes[3], null) };
      }
      // listNotes
      if (url.includes('/notes')) {
        return {
          status: 200,
          body: { notes, hasMore: false, cursor: null },
        };
      }
      return { status: 404, body: {} };
    });

    const client = new GranolaClient('grn_testkey', transport);
    const settings = { ...DEFAULT_SETTINGS, allowedFolders: ['Reviewed'] };
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const report = await syncAll(app, settings, state, client);

    // 2 files written for the 2 'Reviewed' notes
    expect(Object.keys(writtenFiles)).toHaveLength(2);

    // report counts
    expect(report.created).toBe(2);
    expect(report.filteredOut).toBe(2);

    // filteredOut cache contains the 2 non-matching IDs
    expect(state.filteredOut).toHaveProperty('not_draftsFolder03');
    expect(state.filteredOut).toHaveProperty('not_emptyFolders4');
    // values are the updated_at strings for those notes
    expect(state.filteredOut['not_draftsFolder03']).toBe('2026-01-03T11:00:00Z');
    expect(state.filteredOut['not_emptyFolders4']).toBe('2026-01-04T11:00:00Z');

    // the 2 allowed notes are NOT in filteredOut
    expect(state.filteredOut).not.toHaveProperty('not_reviewed000001');
    expect(state.filteredOut).not.toHaveProperty('not_reviewed000002');
  });
});
