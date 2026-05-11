import { describe, it, expect, vi } from 'vitest';
import { runCli } from '../bin/mueslidian';
import type { HttpTransport, Note, NoteWithBody } from '../src/types';

const sampleNote: Note = {
  id: 'not_sample00000001',
  object: 'note',
  title: 'Sample',
  owner: { name: 'A', email: 'a@example.com' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const sampleBody: NoteWithBody = {
  ...sampleNote,
  web_url: 'https://granola.ai/notes/not_sample00000001',
  calendar_event: null,
  attendees: [],
  folder_membership: [],
  summary_text: 'hi',
  summary_markdown: null,
  transcript: null,
};

function makeTransport(routes: { listBody?: unknown; getBody?: unknown }): HttpTransport {
  return vi.fn(async (url: string) => {
    if (url.includes('/notes/not_')) {
      return { status: 200, body: routes.getBody ?? sampleBody };
    }
    return {
      status: 200,
      body: routes.listBody ?? { notes: [sampleNote], hasMore: false, cursor: null },
    };
  });
}

describe('CLI list subcommand (AC14)', () => {
  it('text format prints id and title per line', async () => {
    const result = await runCli(['list'], { GRANOLA_API_KEY: 'grn_x' }, makeTransport({}));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('not_sample00000001');
    expect(result.stdout).toContain('Sample');
  });

  it('--json format produces NDJSON (one JSON note per line)', async () => {
    const result = await runCli(
      ['list', '--json'],
      { GRANOLA_API_KEY: 'grn_x' },
      makeTransport({}),
    );
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBe('not_sample00000001');
    expect(parsed.title).toBe('Sample');
  });
});

describe('CLI get subcommand (AC14)', () => {
  it('--json prints the NoteWithBody as JSON', async () => {
    const result = await runCli(
      ['get', 'not_sample00000001', '--json'],
      { GRANOLA_API_KEY: 'grn_x' },
      makeTransport({}),
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.id).toBe('not_sample00000001');
    expect(parsed.web_url).toContain('granola.ai');
  });

  it('text format prints title and id', async () => {
    const result = await runCli(
      ['get', 'not_sample00000001'],
      { GRANOLA_API_KEY: 'grn_x' },
      makeTransport({}),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('not_sample00000001');
  });
});

describe('CLI dump subcommand (AC14)', () => {
  it('dumps the full NoteWithBody as raw JSON', async () => {
    const result = await runCli(
      ['dump', 'not_sample00000001'],
      { GRANOLA_API_KEY: 'grn_x' },
      makeTransport({}),
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.id).toBe('not_sample00000001');
    expect(parsed.summary_text).toBe('hi');
  });
});
