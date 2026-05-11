import { describe, it, expect } from 'vitest';
import { stampAdditionalFrontmatter } from '../src/markdown';

describe('TS2.12 — Additional frontmatter stamped on creation only', () => {
  const baseline = '---\ntitle: T\n---\nBODY';

  it('stamps additional frontmatter on creation (isCreation=true)', () => {
    const result = stampAdditionalFrontmatter(baseline, { type: 'meeting' }, true);
    expect(result).toContain('type: meeting');
  });

  it('leaves file unchanged on second sync (isCreation=false), preserving first-sync value', () => {
    const afterFirstSync = stampAdditionalFrontmatter(baseline, { type: 'meeting' }, true);
    expect(afterFirstSync).toContain('type: meeting');

    // Second sync: setting changed to 'type: notes', but isCreation=false
    const afterSecondSync = stampAdditionalFrontmatter(afterFirstSync, { type: 'notes' }, false);
    expect(afterSecondSync).toContain('type: meeting');
    expect(afterSecondSync).not.toContain('type: notes');
  });

  it('second sync returns content byte-identical to input', () => {
    const afterFirstSync = stampAdditionalFrontmatter(baseline, { type: 'meeting' }, true);
    const afterSecondSync = stampAdditionalFrontmatter(afterFirstSync, { type: 'notes' }, false);
    expect(afterSecondSync).toBe(afterFirstSync);
  });
});
