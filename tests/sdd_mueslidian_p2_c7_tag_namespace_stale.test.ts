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
  attendeeHeadings: [],
  filenameTimeFormat: 'HH-mm',
};

const attendeeIndex: AttendeeIndex = {
  'eve evans': 'Person - Eve Evans.md',
};

const existing = `---
granola_id: not_with_transcript01
granola_updated_at: 2026-01-27T11:00:00Z
granola_synced_at: 2026-01-27T11:05:00Z
tags: [meeting, granola, person/Old_Person, custom]
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

describe('TS2.7 — Tag namespace ownership: stale tag removed', () => {
  it('removes person/Old_Person and adds person/Eve_Evans', () => {
    const rendered = renderMeeting(fixture as any, {}, settings, attendeeIndex);
    const result = mergeMeetingFile(existing, rendered);

    expect(result).toContain('person/Eve_Evans');
    expect(result).not.toContain('person/Old_Person');
  });

  it('preserves user-owned tags meeting, granola, and custom', () => {
    const rendered = renderMeeting(fixture as any, {}, settings, attendeeIndex);
    const result = mergeMeetingFile(existing, rendered);

    expect(result).toContain('meeting');
    expect(result).toContain('granola');
    expect(result).toContain('custom');
  });

  it('resulting tags array is exactly [meeting, granola, custom, person/Eve_Evans]', () => {
    const rendered = renderMeeting(fixture as any, {}, settings, attendeeIndex);
    const result = mergeMeetingFile(existing, rendered);

    // Extract the tags line from frontmatter
    const fmMatch = result.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).not.toBeNull();
    const fm = fmMatch![1];

    // Parse tags from YAML frontmatter (inline array form or block sequence)
    // Inline: tags: [a, b, c]
    const inlineMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m);
    // Block sequence: tags:\n  - a\n  - b
    const blockMatch = fm.match(/^tags:\s*\n((?:\s+-\s+\S+\n?)+)/m);

    let tags: string[];
    if (inlineMatch) {
      tags = inlineMatch[1].split(',').map(t => t.trim()).filter(Boolean);
    } else if (blockMatch) {
      tags = blockMatch[1]
        .split('\n')
        .map(line => line.replace(/^\s+-\s+/, '').trim())
        .filter(Boolean);
    } else {
      throw new Error('Could not find tags in frontmatter:\n' + fm);
    }

    expect(tags).toContain('meeting');
    expect(tags).toContain('granola');
    expect(tags).toContain('custom');
    expect(tags).toContain('person/Eve_Evans');
    expect(tags).not.toContain('person/Old_Person');
    expect(tags).toHaveLength(4);
  });
});
