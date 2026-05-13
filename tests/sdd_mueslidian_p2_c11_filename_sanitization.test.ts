import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({}));

import { filenameFor } from '../src/vault';
import type { NoteWithBody, MuesliSettings } from '../src/types';

function makeNote(title: string | null): NoteWithBody {
  return {
    id: 'not_abc1234567890ab',
    object: 'note',
    title,
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: '2026-01-27T10:00:00Z',
    updated_at: '2026-01-27T10:00:00Z',
    web_url: 'https://example.com/note',
    calendar_event: {
      event_title: null,
      invitees: [],
      organiser: null,
      calendar_event_id: null,
      scheduled_start_time: '2026-01-27T10:00:00Z',
      scheduled_end_time: '2026-01-27T11:00:00Z',
    },
    attendees: [],
    folder_membership: [],
    summary_text: '',
    summary_markdown: null,
    transcript: null,
  };
}

const defaultSettings: MuesliSettings = {
  apiKey: 'grn_test',
  syncDirectory: 'Besprechungen',
  personFolder: 'Personen',
  allowedFolders: [],
  earliestCreationDate: null,
  documentSyncLimit: 0,
  periodicIntervalMinutes: 0,
  skipExistingNotes: false,
  filenameTemplate: '{date} {title}',
  filenameDateFormat: 'DD.MM.YYYY',
  includeMeta: true,
  includeMyNotesPlaceholder: true,
  includeEnhancedNotes: true,
  includeTranscript: true,
  bodyDateFormat: 'local',
  bodyTimeZone: 'local',
  myName: '',
  attendeeTagTemplate: 'person/{name}',
  additionalFrontmatter: '',
  markerSyntax: 'html',
  attendeeHeadings: [],
};

describe('TS2.10 — Filename sanitization', () => {
  it('replaces forbidden characters /\\:*?"<>| with - in the filename', () => {
    const note = makeNote('Bad /\\:*?"<>| Title');
    const result = filenameFor(note, defaultSettings, new Set());

    expect(result).not.toMatch(/[/\\:*?"<>|]/);
    expect(result.endsWith('.md')).toBe(true);
    expect(result.replace(/\.md$/, '').length).toBeLessThanOrEqual(200);
  });

  it('truncates stem to ≤ 200 characters when title is 300 chars long', () => {
    const note = makeNote('A'.repeat(300));
    const result = filenameFor(note, defaultSettings, new Set());

    expect(result.endsWith('.md')).toBe(true);
    expect(result.replace(/\.md$/, '').length).toBeLessThanOrEqual(200);
  });
});
