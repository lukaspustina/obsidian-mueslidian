import type { GranolaNoteId, MuesliSettings, NoteWithBody } from './types.js';
import { formatDate } from './markdown.js';

// TFile is only used as a type — erased at runtime, so safe to import from obsidian.
import type { TFile } from 'obsidian';

export interface VaultIndexEntry {
  file: TFile;
  granolaUpdatedAt: string;
}

export type VaultIndex = Record<GranolaNoteId, VaultIndexEntry>;

export function filenameFor(
  note: NoteWithBody,
  settings: MuesliSettings,
  existingFilenames: Set<string>
): string {
  const iso = note.calendar_event?.scheduled_start_time ?? note.created_at;
  const dateStr = formatDate(iso, settings.filenameDateFormat, 'utc');

  const title = note.title ?? 'Untitled';

  let stem = settings.filenameTemplate
    .replace('{date}', dateStr)
    .replace('{created_date}', formatDate(note.created_at, settings.filenameDateFormat, 'utc'))
    .replace('{updated_date}', formatDate(note.updated_at, settings.filenameDateFormat, 'utc'))
    .replace('{title}', title)
    .replace('{id}', note.id);

  // Sanitize forbidden characters
  stem = stem.replace(/[/\\:*?"<>|]/g, '-');

  // Truncate stem to 200 chars
  stem = stem.slice(0, 200);

  if (existingFilenames.has(stem + '.md')) {
    stem = (stem + ' ' + note.id).slice(0, 200);
  }

  return stem + '.md';
}
