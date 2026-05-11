import { describe, it, expect, vi } from 'vitest';
import { filenameFor } from '../src/vault';
import { syncAll } from '../src/sync';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, MuesliState, Note, NoteWithBody, MuesliSettings } from '../src/types';

vi.mock('obsidian');

const settings: MuesliSettings = { ...DEFAULT_SETTINGS };

function note(id: string, title: string | null = 'T', dateIso = '2026-01-01T00:00:00Z'): NoteWithBody {
  return {
    id: id as never,
    object: 'note',
    title,
    owner: { name: 'A', email: 'a@example.com' },
    created_at: dateIso,
    updated_at: dateIso,
    web_url: `https://granola.ai/notes/${id}`,
    calendar_event: null,
    attendees: [],
    folder_membership: [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
  };
}

describe('R26 — filename collision suffix preserves the full granola_id', () => {
  it('appends " {id}" when stem clashes', () => {
    const n = note('not_collision00001', 'My Meeting');
    const existing = new Set(['01.01.2026 My Meeting.md']);
    const result = filenameFor(n, settings, existing);
    expect(result).toContain('not_collision00001');
    expect(result.endsWith('.md')).toBe(true);
  });

  it('truncates the title portion (not the id) when total length > 200', () => {
    const longTitle = 'X'.repeat(300);
    const n = note('not_collision00002', longTitle);
    // filenameFor first truncates the template-resolved stem to 200 chars,
    // so the colliding existing filename uses that 200-char form.
    const truncatedStem = ('01.01.2026 ' + longTitle).slice(0, 200);
    const result = filenameFor(n, settings, new Set([truncatedStem + '.md']));
    // The full id should always be present
    expect(result).toContain('not_collision00002');
    // Length without .md ≤ 200
    expect(result.replace(/\.md$/, '').length).toBeLessThanOrEqual(200);
  });
});

describe('R35 — delisted notes are cached in filteredOut', () => {
  it('previously-synced note now in non-allowed folder enters filteredOut', async () => {
    const writtenFiles: Record<string, string> = {
      'Besprechungen/old.md':
        '---\ngranola_id: not_delisted0000a1\ngranola_updated_at: 2026-01-01T00:00:00Z\n---\nold\n',
    };
    const tfile = { path: 'Besprechungen/old.md' };
    const app: unknown = {
      vault: {
        getMarkdownFiles: () => [tfile],
        getAbstractFileByPath: (p: string) => (p === tfile.path ? tfile : null),
        create: vi.fn(),
        read: vi.fn(async (f: { path: string }) => writtenFiles[f.path]),
        modify: vi.fn(async (f: { path: string }, c: string) => {
          writtenFiles[f.path] = c;
        }),
        delete: vi.fn(),
        adapter: { exists: async (p: string) => !!writtenFiles[p], mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: {
        getFileCache: () => ({
          frontmatter: {
            granola_id: 'not_delisted0000a1',
            granola_updated_at: '2026-01-01T00:00:00Z',
          },
        }),
      },
    };

    const listed: Note = {
      id: 'not_delisted0000a1' as never,
      object: 'note',
      title: 'Delisted',
      owner: { name: 'A', email: 'a@example.com' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    };

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes('/notes/not_')) {
        return {
          status: 200,
          body: {
            ...note('not_delisted0000a1', 'Delisted'),
            folder_membership: [{ id: 'fol_drafts0000001', object: 'folder', name: 'Drafts', parent_folder_id: null }],
            updated_at: '2026-02-01T00:00:00Z',
          },
        };
      }
      return { status: 200, body: { notes: [listed], hasMore: false, cursor: null } };
    });

    const client = new GranolaClient('grn_x', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };
    const reviewedSettings: MuesliSettings = { ...settings, allowedFolders: ['Reviewed'] };

    const report = await syncAll(app as never, reviewedSettings, state, client);

    expect(report.delisted).toBe(1);
    // R35: delisted ID is now cached
    expect(state.filteredOut['not_delisted0000a1']).toBe('2026-02-01T00:00:00Z');
  });
});

describe('R49 — unmatchedAttendees populated in SyncReport', () => {
  it('collects attendees with no Person match, deduplicating by name', async () => {
    const writtenFiles: Record<string, string> = {};
    const app: unknown = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: () => null,
        create: vi.fn(async (p: string, c: string) => {
          writtenFiles[p] = c;
          return { path: p };
        }),
        read: vi.fn(),
        modify: vi.fn(),
        delete: vi.fn(),
        adapter: { exists: async () => false, mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: { getFileCache: () => null },
    };

    const listed: Note[] = [
      {
        id: 'not_meeting000001' as never,
        object: 'note',
        title: 'Meeting A',
        owner: { name: 'A', email: 'a@example.com' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'not_meeting000002' as never,
        object: 'note',
        title: 'Meeting B',
        owner: { name: 'A', email: 'a@example.com' },
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    ];

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes('/notes/not_meeting000001')) {
        return {
          status: 200,
          body: {
            ...note('not_meeting000001', 'Meeting A'),
            attendees: [{ name: 'Stranger Person', email: 's@example.com' }],
          },
        };
      }
      if (url.includes('/notes/not_meeting000002')) {
        return {
          status: 200,
          body: {
            ...note('not_meeting000002', 'Meeting B'),
            attendees: [{ name: 'Stranger Person', email: 's@example.com' }],
          },
        };
      }
      return { status: 200, body: { notes: listed, hasMore: false, cursor: null } };
    });

    const client = new GranolaClient('grn_x', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const report = await syncAll(app as never, settings, state, client);

    expect(report.unmatchedAttendees).toHaveLength(1);
    expect(report.unmatchedAttendees[0].name).toBe('Stranger Person');
    expect(report.unmatchedAttendees[0].sourceNoteTitles).toEqual(['Meeting A', 'Meeting B']);
  });

  it('excludes the My-Name self-match from unmatchedAttendees', async () => {
    const writtenFiles: Record<string, string> = {};
    const app: unknown = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: () => null,
        create: vi.fn(async (p: string, c: string) => {
          writtenFiles[p] = c;
          return { path: p };
        }),
        read: vi.fn(),
        modify: vi.fn(),
        delete: vi.fn(),
        adapter: { exists: async () => false, mkdir: async () => {} },
        createFolder: async () => {},
      },
      metadataCache: { getFileCache: () => null },
    };

    const listed: Note = {
      id: 'not_solomeeting0001' as never,
      object: 'note',
      title: 'Solo',
      owner: { name: 'Me', email: 'me@example.com' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const transport: HttpTransport = vi.fn(async (url: string) => {
      if (url.includes('/notes/not_solomeeting0001')) {
        return {
          status: 200,
          body: {
            ...note('not_solomeeting0001', 'Solo'),
            attendees: [{ name: 'Sam Sample', email: 'me@example.com' }],
          },
        };
      }
      return { status: 200, body: { notes: [listed], hasMore: false, cursor: null } };
    });

    const client = new GranolaClient('grn_x', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    const report = await syncAll(
      app as never,
      { ...settings, myName: 'Sam Sample' },
      state,
      client,
    );

    expect(report.unmatchedAttendees).toHaveLength(0);
  });
});
