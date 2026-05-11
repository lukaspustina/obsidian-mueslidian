import { describe, it, expect } from 'vitest';

vi.mock('obsidian', () => ({}));

import { filenameFor } from '../src/vault';
import type { NoteWithBody } from '../src/types';
import type { MuesliSettings } from '../src/settings';

describe('TS2.9 — Filename template', () => {
  it("returns '27.01.2026 Q1 Review.md' for scheduled_start_time '2026-01-27T10:00:00Z' and template '{date} {title}'", () => {
    const note: NoteWithBody = {
      id: 'not_abc12345678901',
      object: 'note',
      title: 'Q1 Review',
      owner: { name: 'Test User', email: 'test@example.com' },
      created_at: '2026-01-20T08:00:00Z',
      updated_at: '2026-01-27T10:00:00Z',
      web_url: 'https://granola.ai/notes/not_abc12345678901',
      calendar_event: {
        event_title: 'Q1 Review',
        invitees: [],
        organiser: null,
        calendar_event_id: null,
        scheduled_start_time: '2026-01-27T10:00:00Z',
        scheduled_end_time: null,
      },
      attendees: [],
      folder_membership: [],
      summary_text: '',
      summary_markdown: null,
      transcript: null,
    };

    const settings: MuesliSettings = {
      apiKey: '',
      syncDirectory: 'Besprechungen',
      personFolder: 'Personen',
      allowedFolders: [],
      earliestCreationDate: null,
      documentSyncLimit: 0,
      periodicIntervalMinutes: 0,
      skipExistingNotes: false,
      filenameTemplate: '{date} {title}',
      filenameDateFormat: 'DD.MM.YYYY',
      includeMyNotesPlaceholder: true,
      includeEnhancedNotes: true,
      includeTranscript: true,
      bodyDateFormat: 'local',
      bodyTimeZone: 'local',
      myName: '',
      attendeeTagTemplate: 'person/{name}',
      additionalFrontmatter: '',
    };

    const result = filenameFor(note, settings, new Set());

    expect(result).toBe('27.01.2026 Q1 Review.md');
  });
});
