import { describe, it, expect, vi } from 'vitest';
import { syncAll } from '../src/sync';
import { GranolaClient } from '../src/granola';
import type { HttpTransport, MuesliSettings, MuesliState, Note, NoteWithBody } from '../src/types';

vi.mock('obsidian');

const defaultSettings: MuesliSettings = {
  apiKey: 'grn_test',
  syncDirectory: 'Besprechungen',
  personFolder: 'Personen',
  allowedFolders: ['Reviewed'],
  earliestCreationDate: null,
  documentSyncLimit: 0,
  periodicIntervalMinutes: 0,
  skipExistingNotes: false,
  filenameTemplate: '{date} {title}',
  filenameDateFormat: 'DD.MM.YYYY',
  includeMeta: true,
  includeMyNotesPlaceholder: true,
  includeEnhancedNotes: true,
  includeTranscript: true,
  bodyDateFormat: 'local',
  bodyTimeZone: 'local',
  myName: '',
  attendeeTagTemplate: 'person/{name}',
  additionalFrontmatter: '',
  markerSyntax: 'html',
  attendeeHeadings: [],
};

// 4 notes: 2 in "Reviewed", 2 in other folders
const listedNotes: Note[] = [
  {
    id: 'not_reviewed000001',
    object: 'note',
    title: 'Reviewed Meeting 1',
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: '2026-01-10T09:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'not_reviewed000002',
    object: 'note',
    title: 'Reviewed Meeting 2',
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: '2026-01-11T09:00:00Z',
    updated_at: '2026-01-11T10:00:00Z',
  },
  {
    id: 'not_drafts0000003',
    object: 'note',
    title: 'Drafts Meeting',
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: '2026-01-12T09:00:00Z',
    updated_at: '2026-01-12T10:00:00Z',
  },
  {
    id: 'not_other0000004',
    object: 'note',
    title: 'Other Meeting',
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: '2026-01-13T09:00:00Z',
    updated_at: '2026-01-13T10:00:00Z',
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

describe('TS3.7 — Clear cache forces refetch', () => {
  it('calls getNote for all 4 IDs and populates filteredOut with the 2 non-matching IDs', async () => {
    const writtenFiles: Record<string, string> = {};
    const vaultCreate = vi.fn(async (path: string, content: string) => {
      writtenFiles[path] = content;
      return {} as never;
    });
    const vaultModify = vi.fn(async (file: unknown, content: string) => {
      writtenFiles[(file as { path: string }).path] = content;
    });

    const app = {
      vault: {
        getMarkdownFiles: () => [],
        read: vi.fn(async () => ''),
        create: vaultCreate,
        modify: vaultModify,
        getAbstractFileByPath: (_p: string) => null,
        adapter: {
          exists: vi.fn(async () => false),
          mkdir: vi.fn(async () => {}),
        },
        createFolder: vi.fn(async () => {}),
      },
      metadataCache: {
        getFileCache: (_f: unknown) => null,
      },
    } as unknown as Parameters<typeof syncAll>[0];

    const getNoteCallIds: string[] = [];

    const transport: HttpTransport = vi.fn(async (url: string) => {
      // getNote calls: URL contains /notes/<id>
      const getMatch = url.match(/\/notes\/(not_[a-zA-Z0-9]+)/);
      if (getMatch) {
        const id = getMatch[1];
        getNoteCallIds.push(id);
        if (id === 'not_reviewed000001') {
          return { status: 200, body: makeNoteWithBody(listedNotes[0], 'Reviewed') };
        }
        if (id === 'not_reviewed000002') {
          return { status: 200, body: makeNoteWithBody(listedNotes[1], 'Reviewed') };
        }
        if (id === 'not_drafts0000003') {
          return { status: 200, body: makeNoteWithBody(listedNotes[2], 'Drafts') };
        }
        if (id === 'not_other0000004') {
          return { status: 200, body: makeNoteWithBody(listedNotes[3], 'Archive') };
        }
        return { status: 404, body: {} };
      }
      // listNotes
      return {
        status: 200,
        body: { notes: listedNotes, hasMore: false, cursor: null },
      };
    });

    const client = new GranolaClient('grn_test', transport);

    // State after [Clear filtered-out cache]: filteredOut = {}, vault is empty
    const state: MuesliState = {
      lastSyncAt: null,
      filteredOut: {},
      lastSyncReport: null,
    };

    await syncAll(app, defaultSettings, state, client);

    // All 4 IDs must have been fetched — cache is empty so all are unknown
    expect(getNoteCallIds).toHaveLength(4);
    expect(getNoteCallIds).toContain('not_reviewed000001');
    expect(getNoteCallIds).toContain('not_reviewed000002');
    expect(getNoteCallIds).toContain('not_drafts0000003');
    expect(getNoteCallIds).toContain('not_other0000004');

    // filteredOut must be populated with exactly the 2 non-matching IDs
    expect(Object.keys(state.filteredOut)).toHaveLength(2);
    expect(state.filteredOut).toHaveProperty('not_drafts0000003');
    expect(state.filteredOut).toHaveProperty('not_other0000004');
    expect(state.filteredOut).not.toHaveProperty('not_reviewed000001');
    expect(state.filteredOut).not.toHaveProperty('not_reviewed000002');
  });
});
