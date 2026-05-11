import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, Note, NoteWithBody, MuesliState } from '../src/types';
import { syncAll } from '../src/sync';

const note: Note = {
  id: 'not_aaaaaaaaaaaa01',
  object: 'note',
  title: 'Meeting A',
  owner: { name: 'Alice', email: 'alice@example.com' },
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T11:00:00Z',
};

function makeNoteWithBody(n: Note): NoteWithBody {
  return {
    ...n,
    web_url: `https://app.granola.ai/notes/${n.id}`,
    calendar_event: null,
    attendees: [],
    folder_membership: [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
  };
}

describe('TS3.13 — Lock prevents re-entry', () => {
  it('second syncAll returns immediately with null/already-running signal; Notice "already running" is fired', async () => {
    let resolveGate!: () => void;
    const gate = new Promise<void>((r) => { resolveGate = r; });

    const writtenFiles: Record<string, string> = {};
    const app: any = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (_p: string) => null,
        create: vi.fn(async (p: string, content: string) => { writtenFiles[p] = content; return { path: p }; }),
        read: vi.fn(async (f: any) => writtenFiles[f.path] ?? ''),
        modify: vi.fn(async (f: any, c: string) => { writtenFiles[f.path] = c; }),
        delete: vi.fn(async (f: any) => { delete writtenFiles[f.path]; }),
        adapter: { exists: async (p: string) => !!writtenFiles[p], mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: { getFileCache: (_f: any) => null },
    };

    // Transport: list returns immediately; getNote blocks on the gate so the
    // first sync is paused mid-run when the second is invoked.
    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes('/notes/not_')) {
        // block here — first sync is now mid-run
        await gate;
        return { status: 200, body: makeNoteWithBody(note) };
      }
      return {
        status: 200,
        body: { notes: [note], hasMore: false, cursor: null },
      };
    });

    const client = new GranolaClient('grn_testkey', transport);
    const settings = { ...DEFAULT_SETTINGS, allowedFolders: [] };
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    // Capture Notice constructor calls by stubbing the global used by src/sync.ts
    const noticeMessages: string[] = [];
    vi.stubGlobal('Notice', class MockedNotice {
      constructor(msg: string, _timeout?: number) {
        noticeMessages.push(msg);
      }
    });

    // Start first sync — does NOT await (paused inside getNote)
    const p1 = syncAll(app, settings, state, client);

    // Yield to the event loop so p1 has progressed past listing into getNote
    await new Promise<void>((r) => setTimeout(r, 10));

    // Second sync while first is paused
    const p2 = syncAll(app, settings, state, client);

    // p2 must resolve quickly (before gate is resolved)
    const p2Result = await p2;

    // The second invocation should signal "already running":
    // either by returning null or by returning a report with no work done.
    const alreadyRunning =
      p2Result === null ||
      (typeof p2Result === 'object' &&
        p2Result !== null &&
        (p2Result as any).created === 0 &&
        (p2Result as any).updated === 0 &&
        (p2Result as any).listed === 0);

    expect(alreadyRunning).toBe(true);

    // A Notice containing "already running" must have been fired
    const hasAlreadyRunningNotice = noticeMessages.some((m) =>
      m.toLowerCase().includes('already running'),
    );
    expect(hasAlreadyRunningNotice).toBe(true);

    // Unblock the first sync and let it finish
    resolveGate();
    const p1Result = await p1;
    expect(p1Result.created).toBe(1);

    vi.unstubAllGlobals();
  });
});
