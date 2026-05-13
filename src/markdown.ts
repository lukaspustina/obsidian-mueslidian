import { load as yamlLoad } from 'js-yaml';
import type {
  AttendeeIndex,
  MuesliSettings,
  NoteWithBody,
} from './types.js';
import {
  extractTypedAttendeeNames,
  generateTag,
  matchAttendee,
  matchAttendeeBySubstring,
  personNameFromFilename,
  shouldExcludeSelf,
} from './attendees.js';
import { serializeFrontmatter, MANAGED_KEYS, splitFrontmatter } from './merge.js';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * R25: replace the `granola_synced_at` value in a rendered/merged file
 * with a caller-supplied ISO timestamp. Caller decides whether to use
 * wall-clock-now (new file) or preserve an existing value (re-write of
 * an unchanged note).
 *
 * Returns the content unchanged when `granola_synced_at` is absent.
 */
export function overrideSyncedAt(content: string, isoTimestamp: string): string {
  return content.replace(
    /(\ngranola_synced_at:\s*)['"]?[^'"\n]+['"]?(\n)/,
    `$1'${isoTimestamp}'$2`,
  );
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

  // Attendee tag pipeline — Granola-detected attendees (exact full-name match).
  const apiTags = note.attendees
    .filter(a => a.name != null && !shouldExcludeSelf(a.name!, settings.myName))
    .filter(a => matchAttendee(attendeeIndex, a.name!) !== undefined)
    .map(a => generateTag(settings.attendeeTagTemplate, a.name!));

  // Typed-attendee tag pipeline — names from configured headings in the
  // enhanced notes (substring/token match; ambiguity treated as unmatched).
  // Use the Person file's full display name for the tag so partial
  // entries ("Alice") still produce a stable, full-name tag.
  const typedNames = extractTypedAttendeeNames(note.summary_markdown, settings.attendeeHeadings);
  const typedTags = typedNames
    .filter(n => !shouldExcludeSelf(n, settings.myName))
    .map(n => matchAttendeeBySubstring(attendeeIndex, n))
    .filter((f): f is string => f !== undefined)
    .map(personNameFromFilename)
    .filter((n): n is string => n !== null)
    .map(name => generateTag(settings.attendeeTagTemplate, name));

  fm['tags'] = [...new Set([...apiTags, ...typedTags])];

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
  const turns = note.transcript.map(turn => {
    const label =
      turn.speaker.source === 'microphone'
        ? (note.owner.name ?? 'Owner')
        : (notesOnSpeakers[turn.speaker.diarization_label ?? ''] ??
           turn.speaker.diarization_label ?? 'Speaker');
    const secs = parseInt(turn.start_time, 10) || 0;
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `**${label} (${mm}:${ss}):** ${turn.text}`;
  });
  // Heading + collapsed `> [!quote]-` callout. Each turn becomes one quoted
  // line; turns separated by a blank quoted line ('> ') to preserve paragraph
  // spacing inside the callout.
  const quoted = turns.map(t => `> ${t}`).join('\n> \n');
  return `## Transcript\n\n> [!quote]- Transcript\n${quoted}`;
}

/** Open/close marker strings for a given block, honoring the settings. */
function markers(name: 'meta' | 'enhanced' | 'transcript', settings: MuesliSettings): {
  start: string;
  end: string;
} {
  if (settings.markerSyntax === 'obsidian') {
    return { start: `%% granola:${name}:start %%`, end: `%% granola:${name}:end %%` };
  }
  return { start: `<!-- granola:${name}:start -->`, end: `<!-- granola:${name}:end -->` };
}

export function renderMeeting(
  note: NoteWithBody,
  notesOnSpeakers: Record<string, string>,
  settings: MuesliSettings,
  attendeeIndex: AttendeeIndex
): string {
  const fm = buildFrontmatterObject(note, settings, attendeeIndex);
  const fmYaml = serializeFrontmatter(fm);
  const meta = settings.includeMeta ? renderMetaCallout(note, attendeeIndex, settings) : null;
  const enhanced = settings.includeEnhancedNotes ? renderEnhanced(note) : null;
  const transcript = settings.includeTranscript ? renderTranscript(note, notesOnSpeakers) : null;

  const mMeta = markers('meta', settings);
  const mEnh = markers('enhanced', settings);
  const mTr = markers('transcript', settings);

  let body = '';

  if (meta !== null) {
    body += `${mMeta.start}\n${meta}\n${mMeta.end}\n`;
  }

  if (enhanced !== null) {
    body += `${mEnh.start}\n${enhanced}\n${mEnh.end}\n`;
  }

  if (settings.includeMyNotesPlaceholder) {
    body += `## My Notes\n\n`;
  }

  if (transcript !== null) {
    body += `${mTr.start}\n${transcript}\n${mTr.end}\n`;
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
