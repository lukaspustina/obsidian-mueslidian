import { describe, it, expect } from 'vitest';
import {
  extractTypedAttendeeNames,
  matchAttendeeBySubstring,
  personNameFromFilename,
} from '../src/attendees';
import { renderMeeting } from '../src/markdown';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { AttendeeIndex, MuesliSettings, NoteWithBody } from '../src/types';

function withSettings(overrides: Partial<MuesliSettings>): MuesliSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('extractTypedAttendeeNames', () => {
  it('returns the bullet items beneath a configured heading', () => {
    const md = [
      '## Teilnehmer',
      '',
      '- Sam Sample (CTO, ExampleCorp)',
      '- Alice',
      '- Bob',
      '- Carter',
      '- Diana',
      '',
      '## Other section',
      '- not an attendee',
    ].join('\n');
    expect(extractTypedAttendeeNames(md, ['Teilnehmer'])).toEqual([
      'Sam Sample',
      'Alice',
      'Bob',
      'Carter',
      'Diana',
    ]);
  });

  it('accepts any heading level and matches case-insensitively', () => {
    const md = '### teilnehmer\n- Alice\n- Bob\n';
    expect(extractTypedAttendeeNames(md, ['Teilnehmer'])).toEqual(['Alice', 'Bob']);
  });

  it('handles multiple configured headings and stops at the next heading', () => {
    const md = [
      '## Teilnehmer',
      '- Alice',
      '## Notes',
      '- this is content, not an attendee',
      '## Attendees',
      '- Charlie',
    ].join('\n');
    expect(extractTypedAttendeeNames(md, ['Teilnehmer', 'Attendees'])).toEqual(['Alice', 'Charlie']);
  });

  it('ignores prose lines and accepts *, +, -, numbered bullets', () => {
    const md = [
      '## Teilnehmer',
      'some intro paragraph (skipped)',
      '* Alice',
      '+ Bob',
      '- Carol',
      '1. Dave',
    ].join('\n');
    expect(extractTypedAttendeeNames(md, ['Teilnehmer'])).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
  });

  it('returns empty when summary is null or headings list is empty', () => {
    expect(extractTypedAttendeeNames(null, ['Teilnehmer'])).toEqual([]);
    expect(extractTypedAttendeeNames('## Teilnehmer\n- Alice', [])).toEqual([]);
  });

  it('returns empty when the configured heading is not present', () => {
    const md = '## Agenda\n- intro';
    expect(extractTypedAttendeeNames(md, ['Teilnehmer'])).toEqual([]);
  });
});

describe('matchAttendeeBySubstring', () => {
  const index: AttendeeIndex = {
    'eve evans': 'Person - Eve Evans.md',
    'alice anderson': 'Person - Alice Anderson.md',
    'charlie carter': 'Person - Charlie Carter.md',
    'sam sample': 'Person - Sam Sample.md',
    'sam smith': 'Person - Sam Smith.md',
  };

  it('matches a first-name-only entry to a unique full name', () => {
    expect(matchAttendeeBySubstring(index, 'Alice')).toBe('Person - Alice Anderson.md');
  });

  it('matches a last-name-only entry', () => {
    expect(matchAttendeeBySubstring(index, 'Carter')).toBe('Person - Charlie Carter.md');
  });

  it('returns undefined for an ambiguous first name with multiple matches', () => {
    expect(matchAttendeeBySubstring(index, 'Lukas')).toBeUndefined();
  });

  it('disambiguates by adding a second token', () => {
    expect(matchAttendeeBySubstring(index, 'Sam Sample')).toBe('Person - Sam Sample.md');
  });

  it('returns undefined for no matches and for an empty needle', () => {
    expect(matchAttendeeBySubstring(index, 'Nonexistent')).toBeUndefined();
    expect(matchAttendeeBySubstring(index, '   ')).toBeUndefined();
  });
});

describe('personNameFromFilename', () => {
  it('recovers the display name from a Person file', () => {
    expect(personNameFromFilename('Person - Eve Evans.md')).toBe('Eve Evans');
  });

  it('returns null for non-matching filenames', () => {
    expect(personNameFromFilename('Random.md')).toBeNull();
  });
});

describe('renderMeeting integration — Teilnehmer adds tags', () => {
  const attendeeIndex: AttendeeIndex = {
    'alice anderson': 'Person - Alice Anderson.md',
    'charlie carter': 'Person - Charlie Carter.md',
  };

  function makeNote(summaryMarkdown: string): NoteWithBody {
    return {
      id: 'not_typedtest00001',
      object: 'note',
      title: 'Team sync',
      owner: { name: 'Owner', email: 'owner@example.com' },
      created_at: '2026-05-13T08:00:00Z',
      updated_at: '2026-05-13T09:00:00Z',
      web_url: 'https://app.granola.ai/notes/not_typedtest00001',
      calendar_event: null,
      attendees: [], // no Granola-detected attendees
      folder_membership: [],
      summary_text: '',
      summary_markdown: summaryMarkdown,
      transcript: null,
    };
  }

  it('produces person/* tags for typed names that uniquely match a Person', () => {
    const md = '## Teilnehmer\n- Alice\n- Carter\n';
    const result = renderMeeting(makeNote(md), {}, withSettings({}), attendeeIndex);
    expect(result).toContain('- person/Alice_Anderson');
    expect(result).toContain('- person/Charlie_Carter');
  });

  it('omits a tag for an ambiguous typed name', () => {
    const indexWithTwoLukas: AttendeeIndex = {
      'sam sample': 'Person - Sam Sample.md',
      'sam smith': 'Person - Sam Smith.md',
    };
    const md = '## Teilnehmer\n- Lukas\n';
    const result = renderMeeting(makeNote(md), {}, withSettings({}), indexWithTwoLukas);
    expect(result).not.toContain('person/Lukas');
  });

  it('respects self-exclusion when myName matches a typed entry', () => {
    const md = '## Teilnehmer\n- Alice\n- Sam Sample\n';
    const indexBoth: AttendeeIndex = {
      ...attendeeIndex,
      'sam sample': 'Person - Sam Sample.md',
    };
    const result = renderMeeting(
      makeNote(md),
      {},
      withSettings({ myName: 'Sam Sample' }),
      indexBoth,
    );
    expect(result).toContain('- person/Alice_Anderson');
    expect(result).not.toContain('person/Sam_Sample');
  });

  it('deduplicates when the same person is detected by Granola and typed', () => {
    const note = makeNote('## Teilnehmer\n- Alice\n');
    note.attendees = [{ name: 'Alice Anderson', email: 'g@example.com' }];
    const result = renderMeeting(note, {}, withSettings({}), attendeeIndex);
    const matches = result.match(/person\/Alice_Anderson/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('does nothing when attendeeHeadings is empty', () => {
    const md = '## Teilnehmer\n- Alice\n';
    const result = renderMeeting(
      makeNote(md),
      {},
      withSettings({ attendeeHeadings: [] }),
      attendeeIndex,
    );
    expect(result).not.toContain('person/Alice_Anderson');
  });
});
