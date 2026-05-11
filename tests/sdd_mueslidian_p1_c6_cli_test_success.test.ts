import { describe, it, expect } from 'vitest';
import { runCli } from '../bin/mueslidian';
import type { HttpTransport } from '../src/types';

const oneNote = {
  id: 'not_abc12345678901',
  object: 'note' as const,
  title: 'Test Meeting',
  owner: { name: 'Test User', email: 'test@example.com' },
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
};

const stubTransport: HttpTransport = async (_url, _opts) => ({
  status: 200,
  body: { notes: [oneNote], hasMore: false, cursor: null },
});

describe('TS1.6 — CLI test command success', () => {
  it('exits 0 and prints OK (1 note) when transport returns 1 note', async () => {
    const result = await runCli(
      ['test'],
      { GRANOLA_API_KEY: 'grn_x' },
      stubTransport,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('OK (1 note)');
  });
});
