import { describe, it, expect } from 'vitest';
import { diffNotes } from '../src/sync';
import type { Note, MuesliState, MuesliSettings } from '../src/types';

const settings: MuesliSettings = {
  apiKey: 'grn_test',
  syncDirectory: 'Besprechungen',
  personFolder: 'Personen',
  allowedFolders: [],
  earliestCreationDate: '2026-01-01',
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

const state: MuesliState = {
  lastSyncAt: null,
  filteredOut: {},
  lastSyncReport: null,
};

const listed: Note[] = [
  {
    id: 'not_old00000000000',
    object: 'note',
    title: 'Old Meeting',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2025-12-15T10:00:00Z',
    updated_at: '2025-12-15T11:00:00Z',
  },
  {
    id: 'not_new00000000000',
    object: 'note',
    title: 'New Meeting',
    owner: { name: 'Alice', email: 'alice@example.com' },
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T11:00:00Z',
  },
];

describe('TS3.8 — Date floor', () => {
  it('includes note after floor in toCreate and excludes note before floor from both toCreate and filteredOut', () => {
    const result = diffNotes({}, listed, state, settings);

    // Note after floor appears in toCreate
    expect(result.toCreate.includes('not_new00000000000')).toBe(true);

    // Note before floor does NOT appear in toCreate
    expect(result.toCreate.includes('not_old00000000000')).toBe(false);

    // Note before floor is NOT cached in filteredOut (FR36)
    expect(result.filteredOut.includes('not_old00000000000')).toBe(false);

    // newFilteredOutCache does not contain the date-excluded ID (FR36)
    expect(result.newFilteredOutCache['not_old00000000000']).toBeUndefined();
  });
});
