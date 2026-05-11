import { describe, it, expect, vi, afterEach } from 'vitest';
import { stampAdditionalFrontmatter } from '../src/markdown';

describe('TS2.14 — additionalFrontmatter collision skipped', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  afterEach(() => {
    warnSpy.mockClear();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('skips colliding plugin-managed key and applies non-colliding key', () => {
    const content = [
      '---',
      'granola_id: not_real0000000001',
      'title: Test Meeting',
      '---',
      '',
      '# Test Meeting',
    ].join('\n');

    const result = stampAdditionalFrontmatter(
      content,
      { granola_id: 'injected', type: 'meeting' },
      true,
    );

    // granola_id must NOT be overwritten
    expect(result).toContain('granola_id: not_real0000000001');
    expect(result).not.toContain('granola_id: injected');

    // non-colliding key must be present
    expect(result).toContain('type: meeting');

    // warn must have been emitted for the skipped key
    expect(warnSpy).toHaveBeenCalled();
  });
});
