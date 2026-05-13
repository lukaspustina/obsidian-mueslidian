import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { HttpTransport, MuesliState, Note } from '../src/types';
import { syncAll } from '../src/sync';
import type { SyncPhase } from '../src/sync';

const noNotes: Note[] = [];

function emptyApp(): any {
  return {
    vault: {
      getMarkdownFiles: () => [],
      getAbstractFileByPath: () => null,
      create: vi.fn(),
      read: vi.fn(),
      modify: vi.fn(),
      delete: vi.fn(),
      adapter: { exists: async () => false },
      createFolder: async () => {},
    },
    metadataCache: { getFileCache: () => null },
  };
}

describe('syncAll onPhase callback', () => {
  it('emits listing → diffing → fetching in order, before onProgress', async () => {
    const phases: SyncPhase[] = [];
    const progressTicks: Array<[number, number]> = [];

    const transport: HttpTransport = vi.fn(async () => ({
      status: 200,
      body: { notes: noNotes, hasMore: false, cursor: null },
    }));

    const client = new GranolaClient('grn_test', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    await syncAll(
      emptyApp(),
      DEFAULT_SETTINGS,
      state,
      client,
      (n, total) => progressTicks.push([n, total]),
      (p) => phases.push(p),
    );

    expect(phases).toEqual(['listing', 'diffing', 'fetching']);
    // No notes to fetch → no progress callbacks fire.
    expect(progressTicks).toEqual([]);
  });

  it('emits listing phase before the first HTTP call (immediate feedback)', async () => {
    const order: string[] = [];
    const transport: HttpTransport = vi.fn(async () => {
      order.push('http');
      return { status: 200, body: { notes: noNotes, hasMore: false, cursor: null } };
    });
    const client = new GranolaClient('grn_test', transport);
    const state: MuesliState = { lastSyncAt: null, filteredOut: {}, lastSyncReport: null };

    await syncAll(
      emptyApp(),
      DEFAULT_SETTINGS,
      state,
      client,
      undefined,
      (p) => order.push(`phase:${p}`),
    );

    expect(order[0]).toBe('phase:listing');
    expect(order).toContain('http');
    // listing fires before any HTTP request goes out.
    expect(order.indexOf('phase:listing')).toBeLessThan(order.indexOf('http'));
  });
});
