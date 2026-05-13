import { describe, it, expect, vi } from 'vitest';
import { syncAll } from '../src/sync';
import { GranolaClient } from '../src/granola';
import type { HttpTransport, MuesliSettings, MuesliState, NoteWithBody } from '../src/types';

vi.mock('obsidian');

const NOTE_ID = 'not_x_invalidated01';
const T1 = '2026-01-01T00:00:00Z';
const T2 = '2026-02-01T00:00:00Z';

const settings: MuesliSettings = {
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
  filenameTimeFormat: 'HH-mm',
};

const noteWithBody: NoteWithBody = {
  id: NOTE_ID,
  object: 'note',
  title: 'Drafts Meeting',
  owner: { name: 'Test User', email: 'test@example.com' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: T2,
  web_url: `https://app.granola.ai/notes/${NOTE_ID}`,
  calendar_event: null,
  attendees: [],
  folder_membership: [{ id: 'fol_drafts00000001', object: 'folder', name: 'Drafts', parent_folder_id: null }],
  summary_text: '',
  summary_markdown: null,
  transcript: null,
};

describe('TS3.6 — Cache invalidated on updated_at advance', () => {
  it('calls getNote when updated_at advances; refreshes filteredOut cache entry to T2', async () => {
    const getNoteSpy = vi.fn(async () => ({ status: 200, body: noteWithBody }));

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes(`/notes/${NOTE_ID}`)) {
        return getNoteSpy();
      }
      // listNotes — return the note with advanced updated_at T2
      return {
        status: 200,
        body: {
          notes: [
            {
              id: NOTE_ID,
              object: 'note',
              title: 'Drafts Meeting',
              owner: { name: 'Test User', email: 'test@example.com' },
              created_at: '2026-01-01T00:00:00Z',
              updated_at: T2,
            },
          ],
          hasMore: false,
          cursor: null,
        },
      };
    });

    const writtenFiles: Record<string, string> = {};
    const app = {
      vault: {
        getMarkdownFiles: () => [],
        read: vi.fn(async () => ''),
        create: vi.fn(async (p: string, c: string) => { writtenFiles[p] = c; return { path: p }; }),
        modify: vi.fn(async (f: { path: string }, c: string) => { writtenFiles[f.path] = c; }),
        adapter: { exists: vi.fn(async () => false), mkdir: vi.fn(async () => {}) },
        createFolder: vi.fn(async () => {}),
      },
      metadataCache: { getFileCache: () => null },
    } as unknown as Parameters<typeof syncAll>[0];

    const client = new GranolaClient('grn_test', transport);

    // Pre-condition: filteredOut has the note at T1
    const state: MuesliState = {
      lastSyncAt: null,
      filteredOut: { [NOTE_ID]: T1 },
      lastSyncReport: null,
    };

    await syncAll(app, settings, state, client);

    // getNote must have been called exactly once for the cache-invalidated note
    expect(getNoteSpy).toHaveBeenCalledTimes(1);

    // filteredOut cache entry must be refreshed to T2 (note is still in non-allowed folder)
    expect(state.filteredOut[NOTE_ID]).toBe(T2);
  });
});
