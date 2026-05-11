import { load as yamlLoad } from 'js-yaml';
import type {
  AttendeeIndex,
  MuesliSettings,
  NoteWithBody,
} from './types.js';
import { generateTag, matchAttendee, shouldExcludeSelf } from './attendees.js';
import { serializeFrontmatter, MANAGED_KEYS, splitFrontmatter } from './merge.js';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(
  iso: string,
  format: string,
  tz: 'local' | 'utc'
): string {
  const d = new Date(iso);
  const year = tz === 'utc' ? d.getUTCFullYear() : d.getFullYear();
  const month = tz === 'utc' ? d.getUTCMonth() : d.getMonth();
  const day = tz === 'utc' ? d.getUTCDate() : d.getDate();

  if (format === 'DD.MM.YYYY') {
    return `${pad(day)}.${pad(month + 1)}.${year}`;
  }
  // YYYY-MM-DD and default
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function buildFrontmatterObject(
  note: NoteWithBody,
  settings: MuesliSettings,
  attendeeIndex: AttendeeIndex
): Record<string, unknown> {
  const fm: Record<string, unknown> = {};

  fm['granola_id'] = note.id;
  fm['granola_updated_at'] = note.updated_at;
  fm['granola_synced_at'] = note.updated_at; // Phase 2: mirror updated_at for idempotency

  if (note.folder_membership.length > 0) {
    fm['granola_folders'] = note.folder_membership.map(f => f.name);
  }

  fm['title'] = note.title ?? 'Untitled';

  // Per SDD §5.3 + §5.5: frontmatter `date` is always YYYY-MM-DD (ISO) so
  // Dataview groups by day consistently. `bodyDateFormat`/`bodyTimeZone`
  // affect the meta callout's "When:" line, not this field.
  const dateSource = note.calendar_event?.scheduled_start_time ?? note.created_at;
  fm['date'] = formatDate(dateSource, 'YYYY-MM-DD', 'utc');

  if (note.calendar_event !== null) {
    if (note.calendar_event.event_title !== null) {
      fm['event_title'] = note.calendar_event.event_title;
    }
    if (note.calendar_event.scheduled_start_time !== null) {
      fm['meeting_start'] = note.calendar_event.scheduled_start_time;
    }
    if (note.calendar_event.scheduled_end_time !== null) {
      fm['meeting_end'] = note.calendar_event.scheduled_end_time;
    }
  }

  if (note.owner.name !== null) {
    fm['owner_name'] = note.owner.name;
  }
  fm['owner_email'] = note.owner.email;

  if (note.calendar_event !== null && note.calendar_event.organiser !== null) {
    fm['organiser'] = note.calendar_event.organiser;
  }

  fm['attendees'] = note.attendees.map(a => a.email);

  if (note.calendar_event !== null) {
    fm['invitees'] = note.calendar_event.invitees.map(i => i.email);

    const inviteeEmails = new Set(note.calendar_event.invitees.map(i => i.email));
    fm['unscheduled_attendees'] = note.attendees
      .map(a => a.email)
      .filter(e => !inviteeEmails.has(e));
  }

  if (note.calendar_event !== null && note.calendar_event.calendar_event_id !== null) {
    fm['calendar_event_id'] = note.calendar_event.calendar_event_id;
  }

  fm['web_url'] = note.web_url;

  // Attendee tag pipeline
  const personTags = note.attendees
    .filter(a => a.name != null && !shouldExcludeSelf(a.name!, settings.myName))
    .filter(a => matchAttendee(attendeeIndex, a.name!) !== undefined)
    .map(a => generateTag(settings.attendeeTagTemplate, a.name!));
  fm['tags'] = personTags;

  return fm;
}

function renderMetaCallout(
  note: NoteWithBody,
  attendeeIndex: AttendeeIndex,
  settings: MuesliSettings,
): string {
  const lines: string[] = [];

  lines.push(`**Title:** ${note.title ?? note.calendar_event?.event_title ?? 'Untitled'}`);

  if (note.calendar_event !== null) {
    if (note.calendar_event.organiser !== null) {
      lines.push(`**Organiser:** ${note.calendar_event.organiser}`);
    }
    const start = note.calendar_event.scheduled_start_time;
    const end = note.calendar_event.scheduled_end_time;
    if (start || end) {
      // R/D15: format the When: line per bodyDateFormat + bodyTimeZone.
      // 'iso' → YYYY-MM-DD; 'local' → DD.MM.YYYY (matches German default).
      const fmt = settings.bodyDateFormat === 'iso' ? 'YYYY-MM-DD' : 'DD.MM.YYYY';
      const tz = settings.bodyTimeZone;
      const startStr = start ? formatDate(start, fmt, tz) : '';
      const endStr = end ? formatDate(end, fmt, tz) : '';
      lines.push(`**When:** ${startStr} → ${endStr}`);
    }
  }

  const attendeeStrs = note.attendees.map(a => {
    const name = a.name ?? a.email;
    const match = matchAttendee(attendeeIndex, a.name ?? '');
    if (match) {
      const noExt = match.replace(/\.md$/, '');
      return `[[${noExt}|${name}]]`;
    }
    return name;
  });
  lines.push(`**Attendees:** ${attendeeStrs.join(', ')}`);

  lines.push(`**Web:** ${note.web_url}`);

  return lines.join('\n');
}

function renderEnhanced(note: NoteWithBody): string {
  return note.summary_markdown ?? note.summary_text ?? '';
}

function renderTranscript(
  note: NoteWithBody,
  notesOnSpeakers: Record<string, string>
): string {
  if (!note.transcript) return '';
  return note.transcript.map(turn => {
    const label =
      turn.speaker.source === 'microphone'
        ? (note.owner.name ?? 'Owner')
        : (notesOnSpeakers[turn.speaker.diarization_label ?? ''] ??
           turn.speaker.diarization_label ?? 'Speaker');
    const secs = parseInt(turn.start_time, 10) || 0;
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `**${label} (${mm}:${ss}):** ${turn.text}`;
  }).join('\n\n');
}

export function renderMeeting(
  note: NoteWithBody,
  notesOnSpeakers: Record<string, string>,
  settings: MuesliSettings,
  attendeeIndex: AttendeeIndex
): string {
  const fm = buildFrontmatterObject(note, settings, attendeeIndex);
  const fmYaml = serializeFrontmatter(fm);
  const meta = renderMetaCallout(note, attendeeIndex, settings);
  const enhanced = settings.includeEnhancedNotes ? renderEnhanced(note) : null;
  const transcript = settings.includeTranscript ? renderTranscript(note, notesOnSpeakers) : null;

  let body = `<!-- granola:meta:start -->\n${meta}\n<!-- granola:meta:end -->\n`;

  if (enhanced !== null) {
    body += `<!-- granola:enhanced:start -->\n${enhanced}\n<!-- granola:enhanced:end -->\n`;
  }

  if (settings.includeMyNotesPlaceholder) {
    body += `## My Notes\n\n`;
  }

  if (transcript !== null) {
    body += `<!-- granola:transcript:start -->\n${transcript}\n<!-- granola:transcript:end -->\n`;
  }

  return `---\n${fmYaml}---\n${body}`;
}

export function stampAdditionalFrontmatter(
  content: string,
  additional: Record<string, string>,
  isCreation: boolean
): string {
  if (!isCreation) return content;

  const { fm, body } = splitFrontmatter(content);

  for (const [k, v] of Object.entries(additional)) {
    if (MANAGED_KEYS.has(k) || k.startsWith('granola_')) {
      console.warn(`mueslidian: skipping additionalFrontmatter key ${k} (collides with plugin-managed namespace)`);
      continue;
    }
    if (k in fm) {
      console.warn(`mueslidian: skipping additionalFrontmatter key ${k} (already present in file)`);
      continue;
    }
    fm[k] = v;
  }

  return `---\n${serializeFrontmatter(fm)}---\n${body}`;
}
