import { describe, it, expect } from 'vitest';
import { renderMeeting } from '../src/markdown';
import { mergeMeetingFile } from '../src/merge';
import type { MuesliSettings, AttendeeIndex } from '../src/types';
import fixture from './fixtures/note-with-transcript.json' with { type: 'json' };

const baseSettings: MuesliSettings = {
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
  includeTranscript: false,
  bodyDateFormat: 'local',
  bodyTimeZone: 'local',
  myName: '',
  attendeeTagTemplate: 'person/{name}',
  additionalFrontmatter: '',
  markerSyntax: 'html',
  attendeeHeadings: [],
  filenameTimeFormat: 'HH-mm',
};

const attendeeIndex: AttendeeIndex = {};

const existing = `---
granola_id: not_with_transcript01
title: Q1 Review Old
---
<!-- granola:meta:start -->
OLD_META_PLACEHOLDER
<!-- granola:meta:end -->
<!-- granola:enhanced:start -->
OLD_ENHANCED_PLACEHOLDER
<!-- granola:enhanced:end -->
## My Notes

Some user notes here.

<!-- granola:transcript:start -->
EXISTING_TRANSCRIPT_TOKEN
This is the existing transcript content.
<!-- granola:transcript:end -->
`;

describe('TS2.3 — Disabled block not destroyed', () => {
  it('preserves existing transcript block when includeTranscript is false', () => {
    const rendered = renderMeeting(fixture as any, {}, baseSettings, attendeeIndex);
    const result = mergeMeetingFile(existing, rendered);

    // Transcript block is preserved verbatim
    expect(result).toContain('EXISTING_TRANSCRIPT_TOKEN');
    expect(result).toContain('<!-- granola:transcript:start -->');
    expect(result).toContain('<!-- granola:transcript:end -->');

    // Meta and enhanced blocks were updated (old placeholders gone)
    expect(result).not.toContain('OLD_META_PLACEHOLDER');
    expect(result).not.toContain('OLD_ENHANCED_PLACEHOLDER');
  });
});
