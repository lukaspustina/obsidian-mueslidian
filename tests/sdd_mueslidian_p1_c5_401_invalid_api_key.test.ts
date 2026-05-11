import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import type { HttpTransport } from '../src/types';

function make401Transport(): { transport: HttpTransport; readonly calls: number } {
  const spy = { calls: 0 };
  const transport: HttpTransport = async (_url, _opts) => {
    spy.calls += 1;
    return { status: 401, body: {} };
  };
  return {
    transport,
    get calls() { return spy.calls; },
  };
}

describe('TS1.5 — 401 throws InvalidApiKey', () => {
  it('listNotes({}) rejects with InvalidApiKey', async () => {
    const spy = make401Transport();
    const client = new GranolaClient('grn_test', spy.transport);

    await expect(client.listNotes({})).rejects.toThrow('InvalidApiKey');
    expect(spy.calls).toBe(1);
  });

  it('getNote rejects with InvalidApiKey', async () => {
    const spy = make401Transport();
    const client = new GranolaClient('grn_test', spy.transport);

    await expect(
      client.getNote('not_x', { includeTranscript: false })
    ).rejects.toThrow('InvalidApiKey');
    expect(spy.calls).toBe(1);
  });

  it('no retries on 401 — exactly one call per method', async () => {
    const spy1 = make401Transport();
    const client1 = new GranolaClient('grn_test', spy1.transport);
    await expect(client1.listNotes({})).rejects.toThrow('InvalidApiKey');
    expect(spy1.calls).toBe(1);

    const spy2 = make401Transport();
    const client2 = new GranolaClient('grn_test', spy2.transport);
    await expect(
      client2.getNote('not_x', { includeTranscript: false })
    ).rejects.toThrow('InvalidApiKey');
    expect(spy2.calls).toBe(1);
  });
});
