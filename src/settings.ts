export type { MuesliSettings } from './types.js';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  syncDirectory: 'Besprechungen',
  personFolder: 'Personen',
  allowedFolders: [] as string[],
  earliestCreationDate: null as string | null,
  documentSyncLimit: 0,
  periodicIntervalMinutes: 0,
  skipExistingNotes: false,
  filenameTemplate: '{date} {title}',
  filenameDateFormat: 'DD.MM.YYYY',
  includeMyNotesPlaceholder: true,
  includeEnhancedNotes: true,
  includeTranscript: true,
  bodyDateFormat: 'local' as const,
  bodyTimeZone: 'local' as const,
  myName: '',
  attendeeTagTemplate: 'person/{name}',
  additionalFrontmatter: '',
};
