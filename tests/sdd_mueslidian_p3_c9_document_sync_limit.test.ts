import { describe, it, expect } from 'vitest';
import { diffNotes } from '../src/sync';
import type { Note, MuesliSettings, MuesliState, VaultIndex } from '../src/types';

function makeNote(id: string, createdAt: string): Note {
  return {
    id,
    object: 'note',
    title: `Note ${id}`,
    owner: { name: 'Test User', email: 'test@example.com' },
    created_at: createdAt,
    updated_at: createdAt,
  };
}

const defaultSettings: MuesliSettings = {
  apiKey: 'grn_test',
  syncDirectory: 'Meetings',
  personFolder: 'Persons',
  allowedFolders: [],
  earliestCreationDate: null,
  documentSyncLimit: 2,
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

const emptyState: MuesliState = {
  lastSyncAt: null,
  filteredOut: {},
  lastSyncReport: null,
};

const emptyVaultIndex: VaultIndex = {};

describe('TS3.9 — Document sync limit', () => {
  it('keeps only the top-2 notes by created_at; the other 3 IDs are absent from all result buckets', () => {
    // 5 notes with descending created_at
    const notes: Note[] = [
      makeNote('not_aaaaaaaaaaaaaa', '2026-05-05T10:00:00Z'),
      makeNote('not_bbbbbbbbbbbbbb', '2026-05-04T10:00:00Z'),
      makeNote('not_cccccccccccccc', '2026-05-03T10:00:00Z'),
      makeNote('not_dddddddddddddd', '2026-05-02T10:00:00Z'),
      makeNote('not_eeeeeeeeeeeeee', '2026-05-01T10:00:00Z'),
    ];

    const result = diffNotes(emptyVaultIndex, notes, emptyState, defaultSettings);

    const top2Ids = ['not_aaaaaaaaaaaaaa', 'not_bbbbbbbbbbbbbb'];
    const excluded3Ids = ['not_cccccccccccccc', 'not_dddddddddddddd', 'not_eeeeeeeeeeeeee'];

    // Only top 2 in toCreate
    expect(result.toCreate).toHaveLength(2);
    expect(result.toCreate).toContain(top2Ids[0]);
    expect(result.toCreate).toContain(top2Ids[1]);

    // Excluded 3 must not appear in any bucket
    for (const id of excluded3Ids) {
      expect(result.filteredOut).not.toContain(id);
      expect(result.toUpdate).not.toContain(id);
      expect(result.unchanged).not.toContain(id);
      expect(result.newFilteredOutCache).not.toHaveProperty(id);
    }
  });
});
