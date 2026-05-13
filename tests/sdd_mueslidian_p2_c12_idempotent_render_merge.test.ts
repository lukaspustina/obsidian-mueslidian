import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import type { MuesliSettings, NoteWithBody } from '../src/types';
import { renderMeeting } from '../src/markdown';
import { mergeMeetingFile } from '../src/merge';
import fixtureRaw from './fixtures/note-with-transcript.json';

const fixture = fixtureRaw as NoteWithBody;

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
  filenameTimeFormat: 'HH-mm',
};

describe('TS2.11 — Idempotent render+merge', () => {
  it('produces byte-identical output on second render+merge with same inputs', () => {
    // First render
    const first = renderMeeting(fixture, {}, settings, {});

    // Simulate "store-then-resync": treat `first` as both existing and rendered
    const merged1 = mergeMeetingFile(first, first);

    // Second render with identical inputs
    const second = renderMeeting(fixture, {}, settings, {});

    // Merge using merged1 as existing
    const merged2 = mergeMeetingFile(merged1, second);

    // Assert byte-identical
    expect(merged1).toBe(merged2);

    // Assert SHA-256 hashes match
    const hash1 = createHash('sha256').update(merged1).digest('hex');
    const hash2 = createHash('sha256').update(merged2).digest('hex');
    expect(hash1).toBe(hash2);
  });
});
