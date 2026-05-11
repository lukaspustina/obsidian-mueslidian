import { describe, it, expect } from 'vitest';
import { runCli } from '../bin/mueslidian';
import type { HttpTransport } from '../src/transport';

const stubTransport: HttpTransport = {
  request: async () => { throw new Error('stub: should not be called'); },
};

describe('TS1.7 — CLI missing key', () => {
  it('exits non-zero and prints GRANOLA_API_KEY to stderr when env is empty', async () => {
    const result = await runCli(['test'], {}, stubTransport);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('GRANOLA_API_KEY');
  });
});
