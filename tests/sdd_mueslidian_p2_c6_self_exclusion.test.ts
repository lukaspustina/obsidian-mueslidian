import { describe, it, expect } from 'vitest';
import { renderMeeting } from '../src/markdown';
import type { NoteWithBody, MuesliSettings } from '../src/types';
import type { AttendeeIndex } from '../src/attendees';

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
  includeTranscript: true,
  bodyDateFormat: 'local',
  bodyTimeZone: 'utc',
  myName: 'Sam Sample',
  attendeeTagTemplate: 'person/{name}',
  additionalFrontmatter: '',
  markerSyntax: 'html',
  attendeeHeadings: [],
  filenameTimeFormat: 'HH-mm',
};

const note: NoteWithBody = {
  id: 'not_selfexclusion0001',
  object: 'note',
  title: 'Self Exclusion Test',
  owner: { name: 'Sam Sample', email: 'lukas@example.com' },
  created_at: '2026-01-27T09:55:00Z',
  updated_at: '2026-01-27T11:00:00Z',
  web_url: 'https://app.granola.ai/notes/not_selfexclusion0001',
  calendar_event: {
    event_title: 'Self Exclusion Test',
    invitees: [{ email: 'lukas@example.com' }],
    organiser: 'lukas@example.com',
    calendar_event_id: 'evt_self_001',
    scheduled_start_time: '2026-01-27T10:00:00Z',
    scheduled_end_time: '2026-01-27T11:00:00Z',
  },
  attendees: [{ name: 'Sam Sample', email: 'lukas@example.com' }],
  folder_membership: [],
  summary_text: 'Test summary.',
  summary_markdown: '# Summary\n\nTest summary.\n',
  transcript: null,
};

const attendeeIndex: AttendeeIndex = {
  'sam sample': 'Person - Sam Sample.md',
};

describe('TS2.6 — Self-exclusion', () => {
  it('does not add person tag for myName attendee', () => {
    const output = renderMeeting(note, {}, baseSettings, attendeeIndex);

    expect(output).not.toContain('person/Sam_Sample');
  });

  it('still lists excluded attendee in attendees frontmatter', () => {
    const output = renderMeeting(note, {}, baseSettings, attendeeIndex);

    expect(output).toContain('lukas@example.com');
  });

  it('still shows excluded attendee in meta callout', () => {
    const output = renderMeeting(note, {}, baseSettings, attendeeIndex);

    const metaStart = output.indexOf('<!-- granola:meta:start -->');
    const metaEnd = output.indexOf('<!-- granola:meta:end -->');
    expect(metaStart).toBeGreaterThanOrEqual(0);
    expect(metaEnd).toBeGreaterThan(metaStart);

    const metaBlock = output.slice(metaStart, metaEnd);
    expect(metaBlock).toContain('Sam Sample');
  });
});
