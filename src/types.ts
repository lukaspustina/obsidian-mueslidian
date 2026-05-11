export type GranolaNoteId = string;

export interface User { name: string | null; email: string; }

export interface CalendarInvitee { email: string; }

export interface CalendarEvent {
  event_title: string | null;
  invitees: CalendarInvitee[];
  organiser: string | null;
  calendar_event_id: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
}

export interface Folder {
  id: string;
  object: 'folder';
  name: string;
  parent_folder_id: string | null;
}

export interface Speaker {
  source: 'microphone' | 'speaker';
  diarization_label?: string;
}

export interface TranscriptTurn {
  speaker: Speaker;
  text: string;
  start_time: string;
  end_time: string;
}

export interface Note {
  id: GranolaNoteId;
  object: 'note';
  title: string | null;
  owner: User;
  created_at: string;
  updated_at: string;
}

export interface NoteWithBody extends Note {
  web_url: string;
  calendar_event: CalendarEvent | null;
  attendees: User[];
  folder_membership: Folder[];
  summary_text: string;
  summary_markdown: string | null;
  transcript: TranscriptTurn[] | null;
}

export interface ListResponse {
  notes: Note[];
  hasMore: boolean;
  cursor: string | null;
}

export type HttpTransport = (
  url: string,
  opts: { method: string; headers: Record<string, string> }
) => Promise<{ status: number; body: unknown }>;

export interface MuesliSettings {
  apiKey: string;
  syncDirectory: string;
  personFolder: string;
  allowedFolders: string[];
  earliestCreationDate: string | null;
  documentSyncLimit: number;
  periodicIntervalMinutes: number;
  skipExistingNotes: boolean;
  filenameTemplate: string;
  filenameDateFormat: string;
  includeMyNotesPlaceholder: boolean;
  includeEnhancedNotes: boolean;
  includeTranscript: boolean;
  bodyDateFormat: 'local' | 'iso';
  bodyTimeZone: 'local' | 'utc';
  myName: string;
  attendeeTagTemplate: string;
  additionalFrontmatter: string;
}

export interface MuesliState {
  lastSyncAt: string | null;
  filteredOut: Record<GranolaNoteId, string>;
  lastSyncReport: SyncReport | null;
}

export interface PluginData {
  settings: MuesliSettings;
  state: MuesliState;
}

export interface SyncReport {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  listed: number;
  created: number;
  updated: number;
  unchanged: number;
  filteredOut: number;
  delisted: number;
  skippedExisting: number;
  stillProcessing: number;
  errors: Array<{ id: GranolaNoteId; reason: string }>;
  unmatchedAttendees: Array<{ name: string; sourceNoteTitles: string[] }>;
  aborted: 'api_unhealthy' | 'network' | 'list_failed' | null;
}

export interface DiffResult {
  toCreate: GranolaNoteId[];
  toUpdate: GranolaNoteId[];
  unchanged: GranolaNoteId[];
  filteredOut: GranolaNoteId[];
  delisted: GranolaNoteId[];
  newFilteredOutCache: Record<GranolaNoteId, string>;
}

export type AttendeeIndex = Record<string, string>;
