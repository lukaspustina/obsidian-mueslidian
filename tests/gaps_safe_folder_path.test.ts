import { describe, it, expect } from 'vitest';
import { safeFolderPath, apiKeyWarning, clampInterval } from '../src/settings';

describe('safeFolderPath (R29)', () => {
  it('accepts a normal relative path', () => {
    expect(safeFolderPath('Besprechungen')).toBe('Besprechungen');
    expect(safeFolderPath('Work/Meetings')).toBe('Work/Meetings');
  });

  it('returns empty string for empty input (means "vault root")', () => {
    expect(safeFolderPath('')).toBe('');
    expect(safeFolderPath('   ')).toBe('');
  });

  it('rejects absolute paths', () => {
    expect(safeFolderPath('/absolute/path')).toBeNull();
    expect(safeFolderPath('\\windows\\style')).toBeNull();
  });

  it('rejects path-traversal segments', () => {
    expect(safeFolderPath('../escape')).toBeNull();
    expect(safeFolderPath('Foo/../Bar')).toBeNull();
    expect(safeFolderPath('valid/Folder/..')).toBeNull();
  });
});

describe('apiKeyWarning (R8 settings tab)', () => {
  it('returns null for empty or grn_-prefixed keys', () => {
    expect(apiKeyWarning('')).toBeNull();
    expect(apiKeyWarning('grn_abc123XYZ')).toBeNull();
  });

  it('returns a warning string for malformed keys', () => {
    expect(apiKeyWarning('foo')).toMatch(/grn_/);
    expect(apiKeyWarning('grn-with-dash')).toMatch(/grn_/);
  });
});

describe('clampInterval (R45)', () => {
  it('clamps to [0, 1440]', () => {
    expect(clampInterval(-10)).toBe(0);
    expect(clampInterval(0)).toBe(0);
    expect(clampInterval(720)).toBe(720);
    expect(clampInterval(1440)).toBe(1440);
    expect(clampInterval(99999)).toBe(1440);
  });

  it('floors non-integers and treats NaN as 0', () => {
    expect(clampInterval(5.9)).toBe(5);
    expect(clampInterval(Number.NaN)).toBe(0);
  });
});
