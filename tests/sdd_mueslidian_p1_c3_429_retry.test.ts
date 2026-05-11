import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GranolaClient } from '../src/granola';
import type { HttpTransport } from '../src/types';
import fixture from './fixtures/list-page-1.json' assert { type: 'json' };

// Use a fixture body with hasMore: false so listNotes doesn't try to paginate
const successBody = { ...fixture, hasMore: false, cursor: null };

describe('TS1.3 — 429 retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on the third attempt after two 429s; spy records exactly 3 calls', async () => {
    let callCount = 0;
    const transport: HttpTransport = vi.fn(async () => {
      callCount += 1;
      if (callCount <= 2) {
        return { status: 429, body: {} };
      }
      return { status: 200, body: successBody };
    });

    const client = new GranolaClient('grn_test_key', transport);

    // Run listNotes alongside advancing fake timers so retries resolve immediately
    const [result] = await Promise.all([
      client.listNotes({}),
      vi.runAllTimersAsync(),
    ]);

    expect(transport).toHaveBeenCalledTimes(3);
    expect(result).toEqual(successBody);
  });
});
