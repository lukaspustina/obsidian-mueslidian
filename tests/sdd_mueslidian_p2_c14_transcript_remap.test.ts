import { describe, it, expect } from 'vitest';
import { renderMeeting } from '../src/markdown';
import type { MuesliSettings } from '../src/types';
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

describe('TS2.13 — Transcript labels with notes_on_speakers remap', () => {
  it('remaps Speaker A to Alice and keeps owner name Oat', () => {
    const notesOnSpeakers = { 'Speaker A': 'Alice' };
    const result = renderMeeting(fixture as any, notesOnSpeakers, defaultSettings, {});

    const transcriptStart = result.indexOf('<!-- granola:transcript:start -->');
    const transcriptEnd = result.indexOf('<!-- granola:transcript:end -->');
    expect(transcriptStart).toBeGreaterThanOrEqual(0);
    expect(transcriptEnd).toBeGreaterThan(transcriptStart);

    const transcriptSection = result.slice(transcriptStart, transcriptEnd);

    expect(transcriptSection).toContain('**Oat (00:00):**');
    expect(transcriptSection).toContain('**Alice (00:12):**');
    expect(transcriptSection).not.toContain('**Speaker A (');
  });
});
