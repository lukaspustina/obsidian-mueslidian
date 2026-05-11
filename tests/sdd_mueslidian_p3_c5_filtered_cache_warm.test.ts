import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, Note, NoteWithBody, MuesliState } from '../src/types';
import { syncAll } from '../src/sync';

// 2 notes in the allowed folder — these will have vault files from a prior sync
const allowedNotes: Note[] = [
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
];

// 2 notes NOT in the allowed folder — pre-loaded into filteredOut cache
const filteredNotes: Note[] = [
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
];

const allNotes: Note[] = [...allowedNotes, ...filteredNotes];

function makeNoteWithBody(note: Note, folderName?: string): NoteWithBody {
  return {
    ...note,
    web_url: `https://app.granola.ai/notes/${note.id}`,
    calendar_event: null,
    attendees: [],
    folder_membership: folderName
      ? [{ id: 'fol_aaaaaaaaaaaa01', object: 'folder', name: folderName, parent_folder_id: null }]
      : [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
  };
}

// Vault files simulate the 2 allowed notes already synced in a prior run
function makeVaultFiles(): Record<string, string> {
  return {
    'Besprechungen/Meeting A.md': [
      '---',
      `granola_id: ${allowedNotes[0].id}`,
      `granola_updated_at: ${allowedNotes[0].updated_at}`,
      `granola_synced_at: 2026-01-01T12:00:00Z`,
      '---',
      '',
    ].join('\n'),
    'Besprechungen/Meeting B.md': [
      '---',
      `granola_id: ${allowedNotes[1].id}`,
      `granola_updated_at: ${allowedNotes[1].updated_at}`,
      `granola_synced_at: 2026-01-02T12:00:00Z`,
      '---',
      '',
    ].join('\n'),
  };
}

describe('TS3.5 — Filtered-out cache stays warm', () => {
  it('makes 0 getNote calls for cached filtered IDs; report.unchanged >= 2; report.filteredOut === 2', async () => {
    const vaultFiles = makeVaultFiles();

    // Track which note IDs were fetched via getNote
    const getNoteCallIds: string[] = [];

    const transport: HttpTransport = vi.fn(async (url: string) => {
      // getNote calls for individual notes
      for (const note of allNotes) {
        if (url.includes(`/notes/${note.id}`)) {
          getNoteCallIds.push(note.id);
          const isAllowed = allowedNotes.some(n => n.id === note.id);
          return {
            status: 200,
            body: makeNoteWithBody(note, isAllowed ? 'Reviewed' : 'Drafts'),
          };
        }
      }
      // list endpoint
      if (url.includes('/notes')) {
        return {
          status: 200,
          body: { notes: allNotes, hasMore: false, cursor: null },
        };
      }
      return { status: 404, body: {} };
    });

    const app: any = {
      vault: {
        getMarkdownFiles: () =>
          Object.keys(vaultFiles).map(path => ({ path })),
        getAbstractFileByPath: (p: string) =>
          vaultFiles[p] != null ? { path: p } : null,
        create: vi.fn(async (p: string, content: string) => {
          vaultFiles[p] = content;
          return { path: p };
        }),
        read: vi.fn(async (f: any) => vaultFiles[f.path]),
        modify: vi.fn(async (f: any, c: string) => {
          vaultFiles[f.path] = c;
        }),
        delete: vi.fn(),
        adapter: {
          exists: async (p: string) => p in vaultFiles,
          mkdir: async () => {},
        },
        createFolder: async () => {},
      },
      metadataCache: {
        getFileCache: (f: any) => {
          const content = vaultFiles[f.path];
          if (!content) return null;
          // Parse out granola_id and granola_updated_at from the stub frontmatter
          const idMatch = content.match(/granola_id: (not_\S+)/);
          const updatedMatch = content.match(/granola_updated_at: (\S+)/);
          if (!idMatch) return null;
          return {
            frontmatter: {
              granola_id: idMatch[1],
              granola_updated_at: updatedMatch?.[1] ?? '',
            },
          };
        },
      },
    };

    const client = new GranolaClient('grn_testkey', transport);
    const settings = { ...DEFAULT_SETTINGS, allowedFolders: ['Reviewed'] };

    // Pre-populate filteredOut cache with the 2 non-allowed note IDs
    // and their matching updated_at values from the list (unchanged)
    const state: MuesliState = {
      lastSyncAt: '2026-01-04T13:00:00Z',
      filteredOut: {
        [filteredNotes[0].id]: filteredNotes[0].updated_at,
        [filteredNotes[1].id]: filteredNotes[1].updated_at,
      },
      lastSyncReport: null,
    };

    const report = await syncAll(app, settings, state, client);

    // The 2 cached filtered IDs must not trigger any getNote call
    const filteredGetNoteCalls = getNoteCallIds.filter(id =>
      filteredNotes.some(n => n.id === id)
    );
    expect(filteredGetNoteCalls).toHaveLength(0);

    // The 2 allowed notes are unchanged → no getNote calls for them either
    // (both updated_at values match the vault; FR37 short-circuits them)
    expect(report.filteredOut).toBe(2);
    // unchanged covers the 2 allowed notes whose updated_at did not advance
    expect(report.unchanged).toBeGreaterThanOrEqual(2);
    expect(report.errors).toHaveLength(0);
  });
});
