import { describe, it, expect } from 'vitest';
import { buildAttendeeIndex } from '../src/attendees';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { MuesliSettings } from '../src/types';

function fakeApp(filePaths: string[]): unknown {
  return {
    vault: {
      getMarkdownFiles: () => filePaths.map(p => ({ path: p })),
    },
  };
}

const settings: MuesliSettings = { ...DEFAULT_SETTINGS, personFolder: 'Personen' };

describe('buildAttendeeIndex (R15)', () => {
  it('returns {} when personFolder is empty', () => {
    const app = fakeApp(['Personen/Person - Alice.md']);
    const idx = buildAttendeeIndex(app, { ...settings, personFolder: '' });
    expect(idx).toEqual({});
  });

  it('returns {} when no files match the Person pattern', () => {
    const app = fakeApp(['Personen/Notes.md', 'Other/Person - Alice.md']);
    expect(buildAttendeeIndex(app, settings)).toEqual({});
  });

  it('indexes matching files by normalized name', () => {
    const app = fakeApp([
      'Personen/Person - Alice Wonderland.md',
      'Personen/Person - Bob Builder.md',
      'Personen/Other.md',
      'Drafts/Person - Eve.md',
    ]);
    const idx = buildAttendeeIndex(app, settings);
    expect(idx).toEqual({
      'alice wonderland': 'Person - Alice Wonderland.md',
      'bob builder': 'Person - Bob Builder.md',
    });
    // case-fold + space-collapse normalization
    expect(idx['ALICE  WONDERLAND'.toLowerCase().replace(/\s+/g, ' ')]).toBe(
      'Person - Alice Wonderland.md',
    );
  });

  it('only scans the configured folder', () => {
    const app = fakeApp(['Other/Person - Alice.md']);
    expect(buildAttendeeIndex(app, settings)).toEqual({});
  });
});
