import { describe, it, expect } from 'vitest';
import { renderMeeting } from '../src/markdown';
import type { MuesliSettings, AttendeeIndex } from '../src/types';
import fixture from './fixtures/note-no-calendar.json' assert { type: 'json' };

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

describe('TS2.4 — Calendar-null edge', () => {
  it('frontmatter omits calendar-derived keys when calendar_event is null', () => {
    const result = renderMeeting(fixture as any, {}, defaultSettings, attendeeIndex);

    expect(result).not.toContain('meeting_start:');
    expect(result).not.toContain('meeting_end:');
    expect(result).not.toContain('invitees:');
    expect(result).not.toContain('unscheduled_attendees:');
    expect(result).not.toContain('event_title:');
    expect(result).not.toContain('organiser:');
  });

  it('meta callout omits Organiser and When lines when calendar_event is null', () => {
    const result = renderMeeting(fixture as any, {}, defaultSettings, attendeeIndex);

    const metaStart = result.indexOf('<!-- granola:meta:start -->');
    const metaEnd = result.indexOf('<!-- granola:meta:end -->');
    expect(metaStart).toBeGreaterThanOrEqual(0);
    expect(metaEnd).toBeGreaterThan(metaStart);

    const metaBlock = result.slice(metaStart, metaEnd);
    expect(metaBlock).not.toContain('**Organiser:**');
    expect(metaBlock).not.toContain('**When:**');
  });
});
