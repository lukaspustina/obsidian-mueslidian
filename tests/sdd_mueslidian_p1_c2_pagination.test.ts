import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import type { HttpTransport } from '../src/types';
import page1 from './fixtures/list-page-1.json' assert { type: 'json' };
import page2 from './fixtures/list-page-2.json' assert { type: 'json' };

describe('TS1.2 — Pagination', () => {
  it('yields all notes from both pages and carries cursor=c on second call', async () => {
    const transport: HttpTransport = vi.fn()
      .mockResolvedValueOnce({ status: 200, body: page1 })
      .mockResolvedValueOnce({ status: 200, body: page2 });

    const client = new GranolaClient('grn_test_key', transport as HttpTransport);
    const notes = [];

    for await (const note of client.listAllNotes({})) {
      notes.push(note);
    }

    // All notes from both pages yielded in order
    expect(notes).toHaveLength(page1.notes.length + page2.notes.length);
    expect(notes).toEqual([...page1.notes, ...page2.notes]);

    // Exactly two HTTP calls were made
    expect(transport).toHaveBeenCalledTimes(2);

    // Second call URL includes cursor=c
    const calls = vi.mocked(transport).mock.calls;
    const secondCallUrl: string = calls[1][0];
    expect(secondCallUrl).toContain('cursor=c');
  });
});
