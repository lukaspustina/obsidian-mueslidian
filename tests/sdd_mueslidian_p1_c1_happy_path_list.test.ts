import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import type { HttpTransport } from '../src/types';
import fixture from './fixtures/list-page-1.json' assert { type: 'json' };

describe('TS1.1 — Happy path list', () => {
  it('yields all notes from fixture and makes exactly one HTTP call', async () => {
    // TS1.1 spec: hasMore: false (single page). The shared fixture has
    // hasMore: true for the pagination test (c2); override here.
    const singlePageBody = { ...fixture, hasMore: false, cursor: null };
    const transport: HttpTransport = vi.fn(async () => ({
      status: 200,
      body: singlePageBody,
    }));

    const client = new GranolaClient('grn_test_key', transport);
    const notes = [];

    for await (const note of client.listAllNotes({})) {
      notes.push(note);
    }

    expect(transport).toHaveBeenCalledTimes(1);
    expect(notes).toHaveLength(fixture.notes.length);
    expect(notes).toEqual(fixture.notes);
  });
});
