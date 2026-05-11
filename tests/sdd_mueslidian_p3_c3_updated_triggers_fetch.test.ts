import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, Note, NoteWithBody, MuesliState } from '../src/types';
import { syncAll } from '../src/sync';

const T1 = '2026-01-01T11:00:00Z';
const T2 = '2026-01-01T12:00:00Z'; // T2 > T1

const noteIds = [
  'not_aaaaaaaaaaaa01',
  'not_bbbbbbbbbbbb02',
  'not_cccccccccccc03',
] as const;

const listedNotes: Note[] = [
  {
    id: noteIds[0],
    object: 'note',
    title: 'Meeting A',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-01T10:00:00Z',
    updated_at: T1, // unchanged
  },
  {
    id: noteIds[1],
    object: 'note',
    title: 'Meeting B',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-02T10:00:00Z',
    updated_at: T2, // advanced — this note changed
  },
  {
    id: noteIds[2],
    object: 'note',
    title: 'Meeting C',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-03T10:00:00Z',
    updated_at: T1, // unchanged
  },
];

function makeNoteWithBody(note: Note, summaryOverride?: string): NoteWithBody {
  return {
    ...note,
    web_url: `https://app.granola.ai/notes/${note.id}`,
    calendar_event: null,
    attendees: [],
    folder_membership: [],
    summary_text: summaryOverride ?? '',
    summary_markdown: summaryOverride ?? null,
    transcript: null,
  };
}

// Simulate vault files already written with granola_updated_at: T1 for all 3
function makeExistingFile(id: string, title: string, updatedAt: string): { path: string; content: string } {
  const path = `Besprechungen/${title}.md`;
  const content = [
    '---',
    `granola_id: ${id}`,
    `granola_updated_at: ${updatedAt}`,
    `granola_synced_at: ${updatedAt}`,
    `title: ${title}`,
    'tags: []',
    '---',
    '<!-- granola:meta:start -->',
    '<!-- granola:meta:end -->',
    '<!-- granola:enhanced:start -->',
    '<!-- granola:enhanced:end -->',
    '<!-- granola:transcript:start -->',
    '<!-- granola:transcript:end -->',
  ].join('\n');
  return { path, content };
}

describe('TS3.3 — Updated note triggers fetch + write', () => {
  it('fetches only the changed note, rewrites exactly one file, and reports { updated: 1 }', async () => {
    const fileA = makeExistingFile(noteIds[0], 'Meeting A', T1);
    const fileB = makeExistingFile(noteIds[1], 'Meeting B', T1);
    const fileC = makeExistingFile(noteIds[2], 'Meeting C', T1);

    const filesByPath: Record<string, string> = {
      [fileA.path]: fileA.content,
      [fileB.path]: fileB.content,
      [fileC.path]: fileC.content,
    };

    const mockTFiles = [fileA, fileB, fileC].map(f => ({ path: f.path }));

    const modifySpy = vi.fn(async (f: any, content: string) => {
      filesByPath[f.path] = content;
    });

    const app: any = {
      vault: {
        getMarkdownFiles: () => mockTFiles,
        getAbstractFileByPath: (p: string) => {
          const f = mockTFiles.find(tf => tf.path === p);
          return f ?? null;
        },
        create: vi.fn(async (p: string, content: string) => {
          filesByPath[p] = content;
          return { path: p };
        }),
        read: vi.fn(async (f: any) => filesByPath[f.path] ?? ''),
        modify: modifySpy,
        delete: vi.fn(async () => {}),
        adapter: {
          exists: async (p: string) => p in filesByPath,
          mkdir: async () => {},
        },
        createFolder: async () => {},
      },
      metadataCache: {
        getFileCache: (f: any) => {
          const id = [fileA, fileB, fileC].find(x => x.path === f.path)
            ? [noteIds[0], noteIds[1], noteIds[2]][
                [fileA.path, fileB.path, fileC.path].indexOf(f.path)
              ]
            : undefined;
          if (id == null) return null;
          return {
            frontmatter: {
              granola_id: id,
              granola_updated_at: T1, // all stored at T1
            },
          };
        },
      },
    };

    const getNoteCallIds: string[] = [];

    const transport: HttpTransport = vi.fn(async (url: string) => {
      // getNote for the changed note (B)
      if (url.includes(`/notes/${noteIds[1]}`)) {
        getNoteCallIds.push(noteIds[1]);
        return {
          status: 200,
          body: makeNoteWithBody(listedNotes[1], 'Updated summary for B'),
        };
      }
      // getNote for other individual notes — should NOT be called
      if (url.includes(`/notes/${noteIds[0]}`)) {
        getNoteCallIds.push(noteIds[0]);
        return { status: 200, body: makeNoteWithBody(listedNotes[0]) };
      }
      if (url.includes(`/notes/${noteIds[2]}`)) {
        getNoteCallIds.push(noteIds[2]);
        return { status: 200, body: makeNoteWithBody(listedNotes[2]) };
      }
      // list endpoint
      if (url.includes('/notes')) {
        return {
          status: 200,
          body: { notes: listedNotes, hasMore: false, cursor: null },
        };
      }
      return { status: 404, body: {} };
    });

    const client = new GranolaClient('grn_testkey', transport);
    const settings = { ...DEFAULT_SETTINGS, allowedFolders: [] };
    const state: MuesliState = {
      lastSyncAt: T1,
      filteredOut: {},
      lastSyncReport: null,
    };

    const report = await syncAll(app, settings, state, client);

    // Only the changed note (B) should have triggered a getNote call
    expect(getNoteCallIds).toEqual([noteIds[1]]);

    // Exactly one file rewritten
    expect(modifySpy).toHaveBeenCalledTimes(1);

    // Report reflects one update
    expect(report.updated).toBe(1);
    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(2);
    expect(report.errors).toHaveLength(0);
  });
});
