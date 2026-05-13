import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({}));

import { filenameFor } from '../src/vault';
import type { NoteWithBody } from '../src/types';
import type { MuesliSettings } from '../src/types';

const defaultSettings: MuesliSettings = {
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

const note: NoteWithBody = {
  id: 'not_abc1234567890ab',
  object: 'note',
  title: null,
  owner: { name: 'Test User', email: 'test@example.com' },
  created_at: '2026-03-15T12:00:00Z',
  updated_at: '2026-03-15T12:00:00Z',
  web_url: 'https://example.com/notes/not_abc1234567890ab',
  calendar_event: null,
  attendees: [],
  folder_membership: [],
  summary_text: '',
  summary_markdown: null,
  transcript: null,
};

describe('TS2.9b — Null title fallback', () => {
  it('uses "Untitled" as the title token when note.title is null', () => {
    const result = filenameFor(note, defaultSettings, new Set());

    expect(result).toContain('Untitled');
    expect(result).toMatch(/\.md$/);
  });
});
