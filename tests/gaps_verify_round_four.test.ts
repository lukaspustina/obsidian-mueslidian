import { describe, it, expect, vi } from 'vitest';
import { overrideSyncedAt } from '../src/markdown';
import { syncOne } from '../src/sync';
import { confirmThen } from '../src/main';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import { Modal } from './__mocks__/obsidian';
import type {
  HttpTransport,
  MuesliSettings,
  MuesliState,
  NoteWithBody,
} from '../src/types';

const settings: MuesliSettings = { ...DEFAULT_SETTINGS };

// ─── R25: granola_synced_at uses wall-clock with preservation ───────────────

describe('R25 — granola_synced_at wall-clock with re-write preservation', () => {
  describe('overrideSyncedAt (pure)', () => {
    it("replaces an existing single-quoted granola_synced_at value", () => {
      const input = "---\ngranola_id: not_x\ngranola_synced_at: '2026-01-27T10:00:00Z'\ntitle: T\n---\nbody";
      const out = overrideSyncedAt(input, '2026-05-12T14:00:00Z');
      expect(out).toContain("granola_synced_at: '2026-05-12T14:00:00Z'");
      expect(out).not.toContain('2026-01-27T10:00:00Z');
    });

    it('leaves content unchanged when granola_synced_at is absent', () => {
      const input = '---\ntitle: T\n---\nbody';
      expect(overrideSyncedAt(input, '2026-05-12T14:00:00Z')).toBe(input);
    });

    it('preserves the rest of the frontmatter and body verbatim', () => {
      const input = "---\ngranola_id: not_x\ngranola_synced_at: '2026-01-27T10:00:00Z'\ntitle: T\n---\n## My Notes\nbody text\n";
      const out = overrideSyncedAt(input, '2026-05-12T14:00:00Z');
      expect(out).toContain('granola_id: not_x');
      expect(out).toContain('title: T');
      expect(out).toContain('## My Notes\nbody text');
    });
  });

  describe('syncOne idempotency uses wall-clock first, preserves on re-write', () => {
    it('first syncOne stamps wall-clock; second syncOne preserves it', async () => {
      const writtenFiles: Record<string, string> = {};
      let createdFile: { path: string } | null = null;

      function makeApp() {
        return {
          vault: {
            getMarkdownFiles: () =>
              createdFile ? [{ path: createdFile.path } as { path: string }] : [],
            getAbstractFileByPath: (p: string) =>
              createdFile && p === createdFile.path ? createdFile : null,
            create: vi.fn(async (p: string, c: string) => {
              writtenFiles[p] = c;
              createdFile = { path: p };
              return createdFile;
            }),
            read: vi.fn(async (f: { path: string }) => writtenFiles[f.path]),
            modify: vi.fn(async (f: { path: string }, c: string) => {
              writtenFiles[f.path] = c;
            }),
            delete: vi.fn(),
            adapter: { exists: async (p: string) => !!writtenFiles[p], mkdir: async () => {} },
            createFolder: async () => {},
          },
          metadataCache: {
            getFileCache: (f: { path: string }) => {
              if (!createdFile || f.path !== createdFile.path) return null;
              // Echo back the actual synced-at value from the written file.
              const content = writtenFiles[f.path];
              const m = content.match(/granola_synced_at:\s*['"]([^'"]+)['"]/);
              return {
                frontmatter: {
                  granola_id: 'not_walltest00001A',
                  granola_updated_at: '2026-01-27T10:00:00Z',
                  granola_synced_at: m ? m[1] : null,
                },
              };
            },
          },
        } as unknown as never;
      }

      const note: NoteWithBody = {
        id: 'not_walltest00001A' as never,
        object: 'note',
        title: 'T',
        owner: { name: 'A', email: 'a@example.com' },
        created_at: '2026-01-27T10:00:00Z',
        updated_at: '2026-01-27T10:00:00Z',
        web_url: 'https://granola.ai/notes/not_walltest00001A',
        calendar_event: null,
        attendees: [],
        folder_membership: [],
        summary_text: '',
        summary_markdown: null,
        transcript: null,
      };

      const transport: HttpTransport = vi.fn(async (url: string) => {
        if (url.includes('/notes/not_walltest00001A')) return { status: 200, body: note };
        return { status: 200, body: { notes: [], hasMore: false, cursor: null } };
      });
      const client = new GranolaClient('grn_x', transport);
      const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

      // Freeze a specific wall-clock for the first write so we can assert.
      const fixedFirst = new Date('2026-05-12T14:00:00Z');
      const origDate = Date;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = class extends origDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super(fixedFirst.toISOString());
          } else {
            // @ts-expect-error pass-through
            super(...args);
          }
        }
        static now(): number {
          return fixedFirst.getTime();
        }
      };

      const app = makeApp();
      await syncOne(app, settings, state, client, 'not_walltest00001A');
      const firstContent = writtenFiles[createdFile!.path];
      expect(firstContent).toContain("granola_synced_at: '2026-05-12T14:00:00.000Z'");

      // Now ADVANCE the wall-clock for the second sync — the synced_at
      // should NOT change because the existing value is preserved.
      const advanced = new Date('2026-05-12T15:00:00Z');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = class extends origDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super(advanced.toISOString());
          } else {
            // @ts-expect-error pass-through
            super(...args);
          }
        }
        static now(): number {
          return advanced.getTime();
        }
      };

      await syncOne(app, settings, state, client, 'not_walltest00001A');
      const secondContent = writtenFiles[createdFile!.path];

      // Restore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = origDate;

      // The synced-at value should be preserved from the first write.
      expect(secondContent).toContain("granola_synced_at: '2026-05-12T14:00:00.000Z'");
      expect(secondContent).not.toContain('2026-05-12T15:00:00.000Z');
      // And the file content should be byte-identical (TS2.11 invariant).
      expect(secondContent).toBe(firstContent);
    });
  });
});

// ─── Phase 3 — confirmation dialog before clearing filtered-out cache ───────

describe('confirmThen — Clear-cache confirmation dialog', () => {
  it('opens a Modal with the message and two buttons', () => {
    const action = vi.fn(async () => {});
    const modal = confirmThen({} as never, 'Are you sure?', action) as unknown as Modal;

    // contentEl now has rendered content via the mock's MockEl recorder.
    const tags = modal.contentEl.children.map(c => c.attrs.tag);
    expect(tags).toContain('h3');
    expect(tags).toContain('p');
    // The action should NOT have been invoked yet — just opened the dialog.
    expect(action).not.toHaveBeenCalled();
  });

  it('renders the message inside a paragraph', () => {
    const modal = confirmThen({} as never, 'Clear cache?', () => {}) as unknown as Modal;
    const paragraph = modal.contentEl.children.find(c => c.attrs.tag === 'p');
    expect(paragraph?.text).toBe('Clear cache?');
  });
});
