import { describe, it, expect, vi } from 'vitest';
import { GranolaClient } from '../src/granola';
import type { HttpTransport } from '../src/types';

describe('TS1.4 — 404 returns null', () => {
  it('returns null when transport responds with 404 and does not throw', async () => {
    const transport: HttpTransport = vi.fn().mockResolvedValue({ status: 404, body: {} });

    const client = new GranolaClient('grn_test_key', transport);

    const result = await client.getNote('not_x', { includeTranscript: true });

    expect(result).toBeNull();
  });

  it('resolves to null (promise form)', async () => {
    const transport: HttpTransport = vi.fn().mockResolvedValue({ status: 404, body: {} });

    const client = new GranolaClient('grn_test_key', transport);

    await expect(
      client.getNote('not_x', { includeTranscript: true })
    ).resolves.toBeNull();
  });

  it('targets the /v1/notes/not_x?include=transcript endpoint', async () => {
    const transport: HttpTransport = vi.fn().mockResolvedValue({ status: 404, body: {} });

    const client = new GranolaClient('grn_test_key', transport);

    await client.getNote('not_x', { includeTranscript: true });

    const calledUrl: string = (transport as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain('/v1/notes/not_x');
    expect(calledUrl).toContain('include=transcript');
  });
});
