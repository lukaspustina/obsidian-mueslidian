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
