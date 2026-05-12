import { describe, it, expect } from 'vitest';
import { mergeMeetingFile } from '../src/merge';

// ─── R10 — block insertion position when toggled back on ─────────────────────

describe('R10 — block re-insertion position', () => {
  const RENDERED_ALL =
    '---\ngranola_id: not_r10test00000A\n---\n' +
    '<!-- granola:meta:start -->\nNEW META\n<!-- granola:meta:end -->\n' +
    '<!-- granola:enhanced:start -->\nNEW ENHANCED\n<!-- granola:enhanced:end -->\n' +
    '<!-- granola:transcript:start -->\nNEW TRANSCRIPT\n<!-- granola:transcript:end -->\n';

  it('inserts a missing transcript block right after the enhanced :end marker, not at EOF', () => {
    // Existing file has meta + enhanced but NO transcript (e.g. user
    // had includeTranscript: false at first write, then re-enabled it).
    const existing =
      '---\ngranola_id: not_r10test00000A\n---\n' +
      '<!-- granola:meta:start -->\nOLD META\n<!-- granola:meta:end -->\n' +
      '<!-- granola:enhanced:start -->\nOLD ENHANCED\n<!-- granola:enhanced:end -->\n' +
      '## My Notes\n\nuser content here\n';

    const merged = mergeMeetingFile(existing, RENDERED_ALL);

    // The transcript block must appear in the body — sanity check.
    expect(merged).toContain('<!-- granola:transcript:start -->');

    // Position: the transcript :start should follow the enhanced :end with
    // nothing else in between (modulo a single newline).
    const enhEnd = merged.indexOf('<!-- granola:enhanced:end -->');
    const txStart = merged.indexOf('<!-- granola:transcript:start -->');
    expect(enhEnd).toBeGreaterThan(-1);
    expect(txStart).toBeGreaterThan(enhEnd);

    const between = merged.slice(
      enhEnd + '<!-- granola:enhanced:end -->'.length,
      txStart,
    );
    expect(between.trim()).toBe('');

    // The "## My Notes" section must remain (user-owned text after transcript).
    expect(merged).toContain('## My Notes');
    expect(merged).toContain('user content here');

    // Negative check: the transcript block must NOT be at EOF (the user
    // content should follow it).
    const userIdx = merged.indexOf('user content here');
    expect(userIdx).toBeGreaterThan(txStart);
  });

  it('inserts the meta block at the start of the body when no preceding blocks exist', () => {
    const existing = '---\ngranola_id: not_r10test00000B\n---\nsome user prelude\n## My Notes\n';
    const renderedMetaOnly =
      '---\ngranola_id: not_r10test00000B\n---\n' +
      '<!-- granola:meta:start -->\nNEW META\n<!-- granola:meta:end -->\n';

    const merged = mergeMeetingFile(existing, renderedMetaOnly);

    // Meta block must appear right at the body start (immediately after `---\n`).
    const bodyStart = merged.indexOf('---\n', merged.indexOf('---\n') + 4) + 4;
    expect(merged.slice(bodyStart).startsWith('<!-- granola:meta:start -->')).toBe(true);

    // User prelude + My Notes preserved AFTER the inserted block.
    expect(merged).toContain('some user prelude');
    expect(merged).toContain('## My Notes');
    const metaEnd = merged.indexOf('<!-- granola:meta:end -->');
    const preludeIdx = merged.indexOf('some user prelude');
    expect(preludeIdx).toBeGreaterThan(metaEnd);
  });

  it('inserts the transcript right after meta when enhanced is absent in both files', () => {
    const existing =
      '---\ngranola_id: not_r10test00000C\n---\n' +
      '<!-- granola:meta:start -->\nOLD META\n<!-- granola:meta:end -->\n' +
      '## My Notes\n\nuser text\n';

    const renderedMetaAndTranscript =
      '---\ngranola_id: not_r10test00000C\n---\n' +
      '<!-- granola:meta:start -->\nNEW META\n<!-- granola:meta:end -->\n' +
      '<!-- granola:transcript:start -->\nNEW TR\n<!-- granola:transcript:end -->\n';

    const merged = mergeMeetingFile(existing, renderedMetaAndTranscript);

    const metaEnd = merged.indexOf('<!-- granola:meta:end -->');
    const txStart = merged.indexOf('<!-- granola:transcript:start -->');
    expect(metaEnd).toBeGreaterThan(-1);
    expect(txStart).toBeGreaterThan(metaEnd);
    expect(merged.slice(metaEnd + '<!-- granola:meta:end -->'.length, txStart).trim()).toBe('');
  });
});
