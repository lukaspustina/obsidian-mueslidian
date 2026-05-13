import type { GranolaNoteId, MuesliSettings, NoteWithBody, VaultIndex, VaultIndexEntry } from './types.js';
import { formatDate, formatTime } from './markdown.js';

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
  const scheduled = note.calendar_event?.scheduled_start_time ?? null;
  const iso = scheduled ?? note.created_at;
  const dateStr = formatDate(iso, settings.filenameDateFormat, 'utc');
  const timeStr = scheduled
    ? formatTime(scheduled, settings.filenameTimeFormat, settings.bodyTimeZone)
    : '';

  const title = note.title ?? 'Untitled';

  let stem = settings.filenameTemplate
    .replace('{date}', dateStr)
    .replace('{time}', timeStr)
    .replace('{created_date}', formatDate(note.created_at, settings.filenameDateFormat, 'utc'))
    .replace('{updated_date}', formatDate(note.updated_at, settings.filenameDateFormat, 'utc'))
    .replace('{title}', title)
    .replace('{id}', note.id);

  // Sanitize forbidden characters, then collapse whitespace that may have
  // resulted from an empty {time} substitution.
  stem = stem.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

  // Truncate stem to 200 chars
  stem = stem.slice(0, 200);

  if (existingFilenames.has(stem + '.md')) {
    stem = disambiguateFilename(stem, timeStr, existingFilenames);
  }

  return stem + '.md';
}

/**
 * Resolve a collision by appending a disambiguator:
 *   1. " {HH-mm}" from the scheduled meeting time when available
 *   2. " (2)", " (3)", … as a stable last resort
 * Always keeps the resulting stem ≤ 200 characters by truncating the base.
 */
function disambiguateFilename(
  baseStem: string,
  timeStr: string,
  existing: Set<string>,
): string {
  const tryWithSuffix = (suffix: string): string => {
    const maxBase = 200 - suffix.length;
    if (maxBase <= 0) return suffix.trimStart().slice(0, 200);
    const truncated = baseStem.length > maxBase ? baseStem.slice(0, maxBase) : baseStem;
    return truncated + suffix;
  };

  if (timeStr) {
    const candidate = tryWithSuffix(' ' + timeStr);
    if (!existing.has(candidate + '.md')) return candidate;
  }

  for (let n = 2; n < 1000; n++) {
    const candidate = tryWithSuffix(` (${n})`);
    if (!existing.has(candidate + '.md')) return candidate;
  }
  // Pathological fallback: 1000+ collisions on the same name. Append a
  // monotonic timestamp so we still produce a unique filename.
  return tryWithSuffix(' ' + Date.now());
}
