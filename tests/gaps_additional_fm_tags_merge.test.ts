import { describe, it, expect, vi, afterEach } from 'vitest';
import { stampAdditionalFrontmatter } from '../src/markdown';
import { splitFrontmatter } from '../src/merge';

describe('stampAdditionalFrontmatter — tags merge', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  afterEach(() => {
    warnSpy.mockClear();
  });

  function render(extraTags: string[]): string {
    return [
      '---',
      'granola_id: not_real0000000001',
      'title: Demo',
      'tags:',
      ...extraTags.map(t => `  - ${t}`),
      '---',
      '',
      'body',
    ].join('\n');
  }

  it('unions array-typed user tags with the rendered person/* set', () => {
    const result = stampAdditionalFrontmatter(
      render(['person/Alice_Anderson']),
      { tags: ['Besprechung', 'todo'] },
      true,
    );
    const { fm } = splitFrontmatter(result);
    expect(fm['tags']).toEqual(['person/Alice_Anderson', 'Besprechung', 'todo']);
  });

  it('accepts a scalar tag value and wraps it into the list', () => {
    const result = stampAdditionalFrontmatter(render([]), { tags: 'todo' }, true);
    const { fm } = splitFrontmatter(result);
    expect(fm['tags']).toEqual(['todo']);
  });

  it('deduplicates when the user tag is already present', () => {
    const result = stampAdditionalFrontmatter(
      render(['Besprechung']),
      { tags: ['Besprechung', 'todo'] },
      true,
    );
    const { fm } = splitFrontmatter(result);
    expect(fm['tags']).toEqual(['Besprechung', 'todo']);
  });

  it('does not apply on update (re-write) — only creation', () => {
    const before = render(['person/Alice_Anderson']);
    const after = stampAdditionalFrontmatter(before, { tags: ['todo'] }, false);
    expect(after).toBe(before);
  });

  it('still rejects other plugin-managed keys', () => {
    const result = stampAdditionalFrontmatter(
      render([]),
      { granola_id: 'injected', title: 'overwrite', type: 'meeting' },
      true,
    );
    const { fm } = splitFrontmatter(result);
    expect(fm['granola_id']).toBe('not_real0000000001');
    expect(fm['title']).toBe('Demo');
    expect(fm['type']).toBe('meeting');
    expect(warnSpy).toHaveBeenCalled();
  });
});
