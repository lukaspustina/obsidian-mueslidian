import { describe, it, expect } from 'vitest';
import { renderMeeting } from '../src/markdown';
import { mergeMeetingFile } from '../src/merge';
import type { MuesliSettings, AttendeeIndex } from '../src/types';
import fixture from './fixtures/note-with-transcript.json' assert { type: 'json' };

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
};

const attendeeIndex: AttendeeIndex = {};

// Existing file uses the legacy `people/{name}` prefix — differs from the
// current template prefix `person`. The tag `people/Friend_Example` is
// user-owned and must survive a re-sync.
const existing = `---
granola_id: not_with_transcript01
granola_updated_at: 2026-01-27T11:00:00Z
granola_synced_at: 2026-01-27T11:05:00Z
tags:
  - people/Friend_Example
  - meeting
  - granola
---
<!-- granola:meta:start -->
OLD META
<!-- granola:meta:end -->
<!-- granola:enhanced:start -->
OLD ENHANCED
<!-- granola:enhanced:end -->
<!-- granola:transcript:start -->
OLD TRANSCRIPT
<!-- granola:transcript:end -->
`;

describe('TS2.8 — Tags from prior namespace preserved', () => {
  it('retains people/Friend_Example after merge when current template prefix is person', () => {
    const rendered = renderMeeting(fixture as any, {}, settings, attendeeIndex);
    const result = mergeMeetingFile(existing, rendered);

    expect(result).toContain('people/Friend_Example');
  });
});
