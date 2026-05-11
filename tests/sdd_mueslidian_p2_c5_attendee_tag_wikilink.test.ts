import { describe, it, expect } from 'vitest';
import { renderMeeting } from '../src/markdown';
import type { MuesliSettings, AttendeeIndex } from '../src/types';
import fixture from './fixtures/note-with-transcript.json' assert { type: 'json' };

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
  includeMyNotesPlaceholder: true,
  includeEnhancedNotes: true,
  includeTranscript: true,
  bodyDateFormat: 'local',
  bodyTimeZone: 'local',
  myName: '',
  attendeeTagTemplate: 'person/{name}',
  additionalFrontmatter: '',
};

const attendeeIndex: AttendeeIndex = {
  'eve evans': 'Person - Eve Evans.md',
};

describe('TS2.5 — Matched attendee → tag + wikilink', () => {
  it('frontmatter tags includes person/Eve_Evans', () => {
    const result = renderMeeting(fixture as any, {}, defaultSettings, attendeeIndex);
    expect(result).toContain('person/Eve_Evans');
  });

  it('meta callout contains wikilink [[Person - Eve Evans|Eve Evans]]', () => {
    const result = renderMeeting(fixture as any, {}, defaultSettings, attendeeIndex);
    expect(result).toContain('[[Person - Eve Evans|Eve Evans]]');
  });
});
