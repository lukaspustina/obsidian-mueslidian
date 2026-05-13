import { describe, it, expect } from 'vitest';
import { renderMeeting } from '../src/markdown';
import { mergeMeetingFile } from '../src/merge';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { AttendeeIndex, MuesliSettings } from '../src/types';
import fixture from './fixtures/note-with-transcript.json' assert { type: 'json' };

const attendeeIndex: AttendeeIndex = {};

function withSettings(overrides: Partial<MuesliSettings>): MuesliSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('markerSyntax setting', () => {
  it('html default produces <!-- granola:* --> markers', () => {
    const result = renderMeeting(fixture as any, {}, withSettings({}), attendeeIndex);
    expect(result).toContain('<!-- granola:meta:start -->');
    expect(result).toContain('<!-- granola:meta:end -->');
    expect(result).toContain('<!-- granola:enhanced:start -->');
    expect(result).toContain('<!-- granola:transcript:start -->');
    expect(result).not.toContain('%% granola:meta:start %%');
  });

  it('obsidian setting produces %% granola:* %% markers', () => {
    const result = renderMeeting(
      fixture as any,
      {},
      withSettings({ markerSyntax: 'obsidian' }),
      attendeeIndex,
    );
    expect(result).toContain('%% granola:meta:start %%');
    expect(result).toContain('%% granola:meta:end %%');
    expect(result).toContain('%% granola:enhanced:start %%');
    expect(result).toContain('%% granola:transcript:start %%');
    expect(result).not.toContain('<!-- granola:meta:start -->');
  });
});

describe('merge dual-read across marker styles', () => {
  it('migrates an existing html-marker file to obsidian markers on re-sync', () => {
    const existing =
      '---\ngranola_id: not_dualread0001A\n---\n' +
      '<!-- granola:meta:start -->\nOLD META\n<!-- granola:meta:end -->\n' +
      '<!-- granola:enhanced:start -->\nOLD ENH\n<!-- granola:enhanced:end -->\n' +
      '## My Notes\n\nuser content stays\n';

    const rendered =
      '---\ngranola_id: not_dualread0001A\n---\n' +
      '%% granola:meta:start %%\nNEW META\n%% granola:meta:end %%\n' +
      '%% granola:enhanced:start %%\nNEW ENH\n%% granola:enhanced:end %%\n';

    const merged = mergeMeetingFile(existing, rendered);

    // Old html-marker blocks are replaced with the obsidian-style rendered ones.
    expect(merged).toContain('%% granola:meta:start %%');
    expect(merged).toContain('%% granola:enhanced:start %%');
    expect(merged).toContain('NEW META');
    expect(merged).toContain('NEW ENH');
    expect(merged).not.toContain('<!-- granola:meta:start -->');
    expect(merged).not.toContain('<!-- granola:enhanced:start -->');
    expect(merged).not.toContain('OLD META');
    expect(merged).not.toContain('OLD ENH');

    // User content outside markers is preserved.
    expect(merged).toContain('## My Notes');
    expect(merged).toContain('user content stays');
  });

  it('inserts an obsidian-marker block after an html-marker prior block', () => {
    const existing =
      '---\ngranola_id: not_dualread0002B\n---\n' +
      '<!-- granola:meta:start -->\nMETA\n<!-- granola:meta:end -->\n' +
      '## My Notes\n\nuser text\n';

    const rendered =
      '---\ngranola_id: not_dualread0002B\n---\n' +
      '%% granola:meta:start %%\nMETA UPDATED\n%% granola:meta:end %%\n' +
      '%% granola:transcript:start %%\nTR\n%% granola:transcript:end %%\n';

    const merged = mergeMeetingFile(existing, rendered);

    // Meta updated; transcript inserted after meta (regardless of marker style).
    const metaEnd = merged.search(/(<!-- granola:meta:end -->|%% granola:meta:end %%)/);
    const txStart = merged.indexOf('%% granola:transcript:start %%');
    expect(metaEnd).toBeGreaterThanOrEqual(0);
    expect(txStart).toBeGreaterThan(metaEnd);
    expect(merged).toContain('## My Notes');
    expect(merged).toContain('user text');
  });
});

describe('includeMeta toggle', () => {
  it('omits the meta block when includeMeta is false', () => {
    const result = renderMeeting(
      fixture as any,
      {},
      withSettings({ includeMeta: false }),
      attendeeIndex,
    );
    expect(result).not.toContain('granola:meta:start');
    expect(result).not.toContain('granola:meta:end');
    // Other blocks still rendered.
    expect(result).toContain('granola:enhanced:start');
  });
});

describe('transcript heading + collapsed callout', () => {
  it('renders a "## Transcript" heading and a collapsed quote callout', () => {
    const result = renderMeeting(fixture as any, {}, withSettings({}), attendeeIndex);
    const trStart = result.indexOf('<!-- granola:transcript:start -->');
    const trEnd = result.indexOf('<!-- granola:transcript:end -->');
    expect(trStart).toBeGreaterThan(-1);
    expect(trEnd).toBeGreaterThan(trStart);
    const trBlock = result.slice(trStart, trEnd);
    expect(trBlock).toContain('## Transcript');
    expect(trBlock).toContain('> [!quote]- Transcript');
  });
});
