import { describe, it, expect, vi } from 'vitest';
import { syncAll } from '../src/sync';
import { GranolaClient } from '../src/granola';
import type { HttpTransport, MuesliSettings, MuesliState, NoteWithBody } from '../src/types';

vi.mock('obsidian');

const NOTE_ID = 'not_x_delisted0001';
const FILE_PATH = 'Besprechungen/foo.md';
const ORIGINAL_CONTENT = 'ORIGINAL';

// The note appears in the list with a newer updated_at than what's in the vault
const LIST_UPDATED_AT = '2026-03-01T00:00:00Z';
const VAULT_UPDATED_AT = '2026-01-01T00:00:00Z';

const noteWithBody: NoteWithBody = {
  id: NOTE_ID,
  object: 'note',
  title: 'Drafts Meeting',
  owner: { name: 'Test User', email: 'test@example.com' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: LIST_UPDATED_AT,
  web_url: `https://app.granola.ai/notes/${NOTE_ID}`,
  calendar_event: null,
  attendees: [],
  // folder_membership is Drafts — not in allowedFolders ['Reviewed']
  folder_membership: [{ id: 'fol_drafts00000001', object: 'folder', name: 'Drafts', parent_folder_id: null }],
  summary_text: '',
  summary_markdown: null,
  transcript: null,
};

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
};

describe('TS3.10 — Delisting', () => {
  it('keeps existing file on disk; does not call vault.delete; report.delisted === 1', async () => {
    // The TFile-like object for the pre-existing synced file
    const existingFile = { path: FILE_PATH, name: 'foo.md', basename: 'foo', extension: 'md' };

    // Track written/deleted state
    const writtenFiles: Record<string, string> = { [FILE_PATH]: ORIGINAL_CONTENT };
    const deleteMock = vi.fn();

    const app = {
      vault: {
        getMarkdownFiles: () => [existingFile],
        read: vi.fn(async (f: { path: string }) => writtenFiles[f.path] ?? ''),
        create: vi.fn(async (p: string, c: string) => { writtenFiles[p] = c; return { path: p }; }),
        modify: vi.fn(async (f: { path: string }, c: string) => { writtenFiles[f.path] = c; }),
        delete: deleteMock,
        adapter: { exists: vi.fn(async (p: string) => p in writtenFiles), mkdir: vi.fn(async () => {}) },
        createFolder: vi.fn(async () => {}),
      },
      // metadataCache returns frontmatter with granola_id and an older granola_updated_at
      metadataCache: {
        getFileCache: (f: { path: string }) => {
          if (f.path === FILE_PATH) {
            return {
              frontmatter: {
                granola_id: NOTE_ID,
                granola_updated_at: VAULT_UPDATED_AT,
              },
            };
          }
          return null;
        },
      },
    } as unknown as Parameters<typeof syncAll>[0];

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes(`/notes/${NOTE_ID}`) && !url.includes('?')) {
        // getNote response — folder_membership = Drafts (not in allowedFolders)
        return { status: 200, body: noteWithBody };
      }
      // listNotes — note appears with newer updated_at
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
              updated_at: LIST_UPDATED_AT,
            },
          ],
          hasMore: false,
          cursor: null,
        },
      };
    });

    const client = new GranolaClient('grn_test', transport);

    // The note was previously synced and is in the vault index; NOT in filteredOut cache
    const state: MuesliState = {
      lastSyncAt: null,
      filteredOut: {},
      lastSyncReport: null,
    };

    const report = await syncAll(app, settings, state, client);

    // The existing file must remain on disk with its original content unchanged
    expect(writtenFiles[FILE_PATH]).toBe(ORIGINAL_CONTENT);

    // vault.delete must NOT have been called
    expect(deleteMock).not.toHaveBeenCalled();

    // report.delisted must be 1
    expect(report.delisted).toBe(1);
  });
});
