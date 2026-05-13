import { describe, it, expect } from 'vitest';
import { renderMeeting } from '../src/markdown';
import { mergeMeetingFile } from '../src/merge';
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
};

const attendeeIndex: AttendeeIndex = {};

const existing = `---
granola_id: not_with_transcript01
granola_updated_at: 2026-01-27T11:00:00Z
granola_synced_at: 2026-01-27T11:05:00Z
priority: high
tags: []
---
<!-- granola:meta:start -->
OLD META
<!-- granola:meta:end -->
<!-- granola:enhanced:start -->
OLD ENHANCED
<!-- granola:enhanced:end -->

## My Notes

User text

<!-- granola:transcript:start -->
OLD TRANSCRIPT
<!-- granola:transcript:end -->
`;

describe('TS2.2 — Merge preserves user content', () => {
  it('preserves priority: high and User text; replaces marker block contents', () => {
    const rendered = renderMeeting(fixture as any, {}, defaultSettings, attendeeIndex);
    const result = mergeMeetingFile(existing, rendered);

    expect(result).toContain('priority: high');
    expect(result).toContain('User text');

    expect(result).not.toContain('OLD META');
    expect(result).not.toContain('OLD ENHANCED');
    expect(result).not.toContain('OLD TRANSCRIPT');
  });
});
