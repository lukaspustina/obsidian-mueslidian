// Phase 4, criterion 7 (TS4.6): QuickAdd absent fallback
// GIVEN app.plugins.plugins['quickadd'] is undefined AND unmatched attendee "Bob Smith" is clicked
// WHEN the handler runs
// THEN a file is created at <personFolder>/Person - Bob Smith.md with frontmatter containing
//      note_type: person_note; Notice called with string containing "Created stub".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleUnmatchedAttendeeClick } from '../src/main';
import type { MuesliSettings } from '../src/types';

const DEFAULT_SETTINGS: MuesliSettings = {
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

describe('TS4.6 — QuickAdd absent fallback', () => {
  let writtenFiles: Record<string, string>;
  let app: any;
  let noticeMessages: string[];
  let NoticeStub: ReturnType<typeof vi.fn<any, any>>;

  beforeEach(() => {
    writtenFiles = {};

    app = {
      vault: {
        create: vi.fn(async (path: string, content: string) => {
          writtenFiles[path] = content;
          return { path };
        }),
        getAbstractFileByPath: (_p: string) => null,
        adapter: {
          exists: async (p: string) => !!writtenFiles[p],
          mkdir: async () => {},
        },
        createFolder: async () => {},
      },
      plugins: { plugins: {} }, // no quickadd
    };

    noticeMessages = [];
    NoticeStub = vi.fn(function (this: any, msg: string) {
      noticeMessages.push(msg);
    });
    vi.stubGlobal('Notice', NoticeStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates stub file at personFolder/Person - Bob Smith.md', async () => {
    const settings: MuesliSettings = { ...DEFAULT_SETTINGS, personFolder: 'Personen' };

    await handleUnmatchedAttendeeClick(app, settings, 'Bob Smith');

    expect(writtenFiles['Personen/Person - Bob Smith.md']).toBeDefined();
  });

  it('stub file contains note_type: person_note in frontmatter', async () => {
    const settings: MuesliSettings = { ...DEFAULT_SETTINGS, personFolder: 'Personen' };

    await handleUnmatchedAttendeeClick(app, settings, 'Bob Smith');

    const content = writtenFiles['Personen/Person - Bob Smith.md'];
    expect(content).toContain('note_type: person_note');
  });

  it('fires a Notice containing "Created stub"', async () => {
    const settings: MuesliSettings = { ...DEFAULT_SETTINGS, personFolder: 'Personen' };

    await handleUnmatchedAttendeeClick(app, settings, 'Bob Smith');

    expect(noticeMessages.length).toBeGreaterThanOrEqual(1);
    expect(noticeMessages.some((m) => m.includes('Created stub'))).toBe(true);
  });
});
