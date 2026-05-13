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

const attendeeIndex: AttendeeIndex = {};

describe('TS2.1 — Render new file structure', () => {
  it('output contains frontmatter and all section markers in order', () => {
    const result = renderMeeting(fixture as any, {}, defaultSettings, attendeeIndex);

    expect(typeof result).toBe('string');

    // Frontmatter block
    const fmOpen = result.indexOf('---\n');
    const fmClose = result.indexOf('\n---\n', fmOpen + 1);
    expect(fmOpen).toBeGreaterThanOrEqual(0);
    expect(fmClose).toBeGreaterThan(fmOpen);

    // Section markers in order
    const markers = [
      '<!-- granola:meta:start -->',
      '<!-- granola:meta:end -->',
      '<!-- granola:enhanced:start -->',
      '<!-- granola:enhanced:end -->',
      '## My Notes',
      '<!-- granola:transcript:start -->',
      '<!-- granola:transcript:end -->',
    ];

    let prev = fmClose;
    for (const marker of markers) {
      const idx = result.indexOf(marker, prev);
      expect(idx, `marker "${marker}" not found after position ${prev}`).toBeGreaterThan(prev);
      prev = idx;
    }
  });
});
