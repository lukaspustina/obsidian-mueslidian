import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, NoteWithBody, MuesliState } from '../src/types';
import { syncOne } from '../src/sync';

// ID must match /not_[a-zA-Z0-9]{14}/
// 'xxbypass000001' = 14 alphanumeric chars ✓
const VALID_NOTE_ID = 'not_xxbypass000001';
const INPUT_URL = `https://app.granola.ai/notes/${VALID_NOTE_ID}`;

const noteBody: NoteWithBody = {
  id: VALID_NOTE_ID,
  object: 'note',
  title: 'Bypass Test Meeting',
  owner: { name: 'Alice', email: 'alice@example.com' },
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-01-10T11:00:00Z',
  web_url: INPUT_URL,
  calendar_event: null,
  attendees: [],
  // Note lives in 'Drafts', which is not in allowedFolders: ['Reviewed']
  folder_membership: [{ id: 'fol_aaaaaaaaaaaa01', object: 'folder', name: 'Drafts', parent_folder_id: null }],
  summary_text: '',
  summary_markdown: null,
  transcript: null,
};

describe('TS3.14 — On-demand bypasses filters', () => {
  it('fetches and writes note outside allowedFolders; emits a Notice about the allowlist bypass', async () => {
    const writtenFiles: Record<string, string> = {};
    const app: any = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (_p: string) => null,
        create: vi.fn(async (p: string, content: string) => {
          writtenFiles[p] = content;
          return { path: p };
        }),
        read: vi.fn(async (f: any) => writtenFiles[f.path] ?? ''),
        modify: vi.fn(async (f: any, c: string) => { writtenFiles[f.path] = c; }),
        delete: vi.fn(async () => {}),
        adapter: { exists: async (p: string) => !!writtenFiles[p], mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: { getFileCache: (_f: any) => null },
    };

    const getNoteSpy = vi.fn(async () => ({ status: 200, body: noteBody }));

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes(`/notes/${VALID_NOTE_ID}`)) {
        return getNoteSpy();
      }
      return { status: 404, body: {} };
    });

    // Capture Notice constructor calls via global stub (same pattern as TS3.13)
    const noticeMessages: string[] = [];
    vi.stubGlobal('Notice', class MockedNotice {
      constructor(msg: string, _timeout?: number) {
        noticeMessages.push(msg);
      }
    });

    const client = new GranolaClient('grn_testkey', transport);
    // allowedFolders = ['Reviewed'] — note lives in 'Drafts', syncAll would filter it out
    const settings = { ...DEFAULT_SETTINGS, allowedFolders: ['Reviewed'] };
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const result = await syncOne(app, settings, state, client, INPUT_URL);

    // getNote was called exactly once despite the folder mismatch
    expect(getNoteSpy).toHaveBeenCalledTimes(1);

    // A file was written for the note
    expect(result.written).toBe(true);
    expect(Object.keys(writtenFiles)).toHaveLength(1);

    // A Notice was emitted referencing the allowlist bypass
    const bypassMentioned = noticeMessages.some((msg) => /allowlist|bypass/i.test(msg));
    expect(bypassMentioned).toBe(true);

    vi.unstubAllGlobals();
  });
});
