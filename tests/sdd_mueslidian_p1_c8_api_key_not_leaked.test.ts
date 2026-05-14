import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { runCli } from '../bin/mueslidian';
import type { HttpTransport, NoteWithBody } from '../src/types';

const apiKey = 'grn_DEADBEEFCAFE_secret_key_12345';

const minimalNote: NoteWithBody = {
  id: 'not_xxxxxxxxxxxxxx',
  object: 'note',
  title: 'Fixture Meeting',
  owner: { name: 'Test User', email: 'test@example.com' },
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  web_url: 'https://app.granola.ai/notes/not_xxxxxxxxxxxxxx',
  calendar_event: null,
  attendees: [],
  folder_membership: [],
  summary_text: 'Summary text',
  summary_markdown: '## Summary\n\nSummary text',
  transcript: null,
};

const stubTransport: HttpTransport = async (url, _opts) => {
  if (url.includes('/notes/')) {
    return { status: 200, body: minimalNote };
  }
  return {
    status: 200,
    body: { notes: [], hasMore: false, cursor: null },
  };
};

const subcommands: Array<{ argv: string[]; label: string }> = [
  { argv: ['test'], label: 'test' },
  { argv: ['list'], label: 'list' },
  { argv: ['get', 'not_xxxxxxxxxxxxxx'], label: 'get' },
  { argv: ['dump', 'not_xxxxxxxxxxxxxx'], label: 'dump' },
];

describe('TS1.8 — API key not leaked', () => {
  const consoleMethods = ['log', 'error', 'warn', 'info', 'debug'] as const;
  const capturedConsole: string[] = [];
  const spies: Array<MockInstance<(...args: any[]) => any>> = [];

  beforeEach(() => {
    capturedConsole.length = 0;
    for (const method of consoleMethods) {
      const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        capturedConsole.push(args.map(String).join(' '));
      });
      spies.push(spy);
    }
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies.length = 0;
  });

  for (const { argv, label } of subcommands) {
    it(`does not leak API key in stdout or stderr for subcommand: ${label}`, async () => {
      const result = await runCli(argv, { GRANOLA_API_KEY: apiKey }, stubTransport);

      expect(result.stdout).not.toContain(apiKey);
      expect(result.stderr).not.toContain(apiKey);
    });

    it(`does not leak API key in console.* output for subcommand: ${label}`, async () => {
      await runCli(argv, { GRANOLA_API_KEY: apiKey }, stubTransport);

      for (const captured of capturedConsole) {
        expect(captured).not.toContain(apiKey);
      }
    });
  }
});
