import { describe, it, expect } from 'vitest';
import { filenameFor } from '../src/vault';
import { formatTime } from '../src/markdown';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { MuesliSettings, NoteWithBody } from '../src/types';

function withSettings(overrides: Partial<MuesliSettings>): MuesliSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function note(
  id: string,
  title: string | null,
  opts: { scheduledStart?: string | null; createdAt?: string } = {},
): NoteWithBody {
  const created = opts.createdAt ?? '2026-05-04T08:00:00Z';
  return {
    id: id as never,
    object: 'note',
    title,
    owner: { name: 'A', email: 'a@example.com' },
    created_at: created,
    updated_at: created,
    web_url: `https://granola.ai/notes/${id}`,
    calendar_event: opts.scheduledStart === undefined
      ? null
      : {
          event_title: title,
          invitees: [],
          organiser: null,
          calendar_event_id: null,
          scheduled_start_time: opts.scheduledStart,
          scheduled_end_time: null,
        },
    attendees: [],
    folder_membership: [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
  };
}

describe('formatTime', () => {
  it('formats HH-mm in UTC', () => {
    expect(formatTime('2026-05-04T14:30:00Z', 'HH-mm', 'utc')).toBe('14-30');
  });

  it('pads single-digit hours and minutes', () => {
    expect(formatTime('2026-05-04T07:05:00Z', 'HH-mm', 'utc')).toBe('07-05');
  });

  it('supports custom separators', () => {
    expect(formatTime('2026-05-04T14:30:00Z', 'HH.mm', 'utc')).toBe('14.30');
  });
});

describe('filenameFor — {time} token', () => {
  it('substitutes meeting start time into the template', () => {
    const n = note('not_a1', 'Project Phoenix', { scheduledStart: '2026-05-04T14:30:00Z' });
    const settings = withSettings({
      filenameTemplate: 'Besprechung - {title}, {date} {time}',
      bodyTimeZone: 'utc',
    });
    expect(filenameFor(n, settings, new Set())).toBe(
      'Besprechung - Project Phoenix, 04.05.2026 14-30.md',
    );
  });

  it('omits the time and collapses whitespace when no calendar event exists', () => {
    const n = note('not_a2', 'No Calendar', { scheduledStart: undefined });
    const settings = withSettings({
      filenameTemplate: 'Besprechung - {title}, {date} {time}',
    });
    expect(filenameFor(n, settings, new Set())).toBe(
      'Besprechung - No Calendar, 04.05.2026.md',
    );
  });
});

describe('filenameFor — collision disambiguator', () => {
  const settings = withSettings({
    filenameTemplate: 'Besprechung - {title}, {date}',
    bodyTimeZone: 'utc',
  });

  it('appends " HH-mm" when the meeting has a scheduled start time', () => {
    const n = note('not_b1', 'Project Phoenix', { scheduledStart: '2026-05-04T14:30:00Z' });
    const existing = new Set(['Besprechung - Project Phoenix, 04.05.2026.md']);
    expect(filenameFor(n, settings, existing)).toBe(
      'Besprechung - Project Phoenix, 04.05.2026 14-30.md',
    );
  });

  it('falls through to " (2)" when the time-suffixed name is also taken', () => {
    const n = note('not_b2', 'Project Phoenix', { scheduledStart: '2026-05-04T14:30:00Z' });
    const existing = new Set([
      'Besprechung - Project Phoenix, 04.05.2026.md',
      'Besprechung - Project Phoenix, 04.05.2026 14-30.md',
    ]);
    expect(filenameFor(n, settings, existing)).toBe(
      'Besprechung - Project Phoenix, 04.05.2026 (2).md',
    );
  });

  it('uses " (2)" directly when no scheduled start time is available', () => {
    const n = note('not_b3', 'Ad-hoc');
    const existing = new Set(['Besprechung - Ad-hoc, 04.05.2026.md']);
    expect(filenameFor(n, settings, existing)).toBe(
      'Besprechung - Ad-hoc, 04.05.2026 (2).md',
    );
  });

  it('walks " (2)", " (3)", " (4)" on further collisions', () => {
    const n = note('not_b4', 'Ad-hoc');
    const existing = new Set([
      'Besprechung - Ad-hoc, 04.05.2026.md',
      'Besprechung - Ad-hoc, 04.05.2026 (2).md',
      'Besprechung - Ad-hoc, 04.05.2026 (3).md',
    ]);
    expect(filenameFor(n, settings, existing)).toBe(
      'Besprechung - Ad-hoc, 04.05.2026 (4).md',
    );
  });

  it('never appends the granola_id (legacy R26 behavior is gone)', () => {
    const n = note('not_b5', 'Whatever');
    const existing = new Set(['Besprechung - Whatever, 04.05.2026.md']);
    const result = filenameFor(n, settings, existing);
    expect(result).not.toContain('not_b5');
  });
});
