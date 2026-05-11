import type { GranolaNoteId, MuesliSettings, NoteWithBody, VaultIndex, VaultIndexEntry } from './types.js';
import { formatDate } from './markdown.js';

export type { VaultIndex, VaultIndexEntry };

export function buildVaultIndex(app: unknown, settings: MuesliSettings): VaultIndex {
  const a = app as {
    vault: { getMarkdownFiles: () => Array<{ path: string }> };
    metadataCache: { getFileCache: (f: unknown) => { frontmatter?: Record<string, unknown> } | null };
  };

  const dir = settings.syncDirectory;
  const all = a.vault.getMarkdownFiles();
  const filtered = !dir
    ? all
    : all.filter(f => f.path.startsWith(dir + '/') || f.path === dir);
  const sorted = [...filtered].sort((x, y) => x.path.localeCompare(y.path));

  const index: VaultIndex = {};
  for (const file of sorted) {
    const cache = a.metadataCache.getFileCache(file);
    if (!cache || !cache.frontmatter) continue;
    const idRaw = cache.frontmatter['granola_id'];
    if (typeof idRaw !== 'string') continue;
    if (index[idRaw]) {
      console.warn(`mueslidian: duplicate granola_id ${idRaw}; keeping first by path`);
      continue;
    }
    const updatedRaw = cache.frontmatter['granola_updated_at'];
    const granolaUpdatedAt = typeof updatedRaw === 'string' ? updatedRaw : '';
    index[idRaw] = { file, granolaUpdatedAt };
  }
  return index;
}

export function findExistingByGranolaId(
  index: VaultIndex,
  id: GranolaNoteId
): VaultIndexEntry | undefined {
  return index[id];
}

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
    // Per R26: append the full granola_id before .md, preserving the id.
    // If the resulting stem exceeds 200 chars, truncate the title portion
    // (the leading slice) rather than the id suffix.
    const suffix = ' ' + note.id;
    const maxBase = 200 - suffix.length;
    if (maxBase <= 0) {
      stem = note.id.slice(0, 200);
    } else if (stem.length > maxBase) {
      stem = stem.slice(0, maxBase) + suffix;
    } else {
      stem = stem + suffix;
    }
  }

  return stem + '.md';
}
