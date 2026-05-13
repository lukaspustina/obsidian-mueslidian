import type { AttendeeIndex, MuesliSettings } from './types.js';

export type { AttendeeIndex };

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Scan `settings.personFolder` for files matching `Person - {First Last}.md`.
 * Returns a map from normalized name → vault filename (basename + extension).
 * Empty `personFolder` returns `{}`. Files outside that folder are ignored.
 */
export function buildAttendeeIndex(app: unknown, settings: MuesliSettings): AttendeeIndex {
  const folder = settings.personFolder?.trim();
  if (!folder) return {};

  const a = app as {
    vault?: { getMarkdownFiles?: () => Array<{ path: string; name?: string; basename?: string }> };
  };
  const files = a.vault?.getMarkdownFiles?.() ?? [];
  const prefix = folder.endsWith('/') ? folder : folder + '/';

  const index: AttendeeIndex = {};
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    // Use basename if provided, else derive from path.
    const slash = f.path.lastIndexOf('/');
    const filename = f.path.slice(slash + 1);
    // Match "Person - {First Last}.md"
    const m = filename.match(/^Person - (.+)\.md$/);
    if (!m) continue;
    const personName = m[1].trim();
    if (!personName) continue;
    index[normalizeName(personName)] = filename;
  }
  return index;
}

export function matchAttendee(index: AttendeeIndex, name: string): string | undefined {
  return index[normalizeName(name)];
}

/**
 * Token-based substring match: every token of `needle` must appear as a
 * token in the indexed person name. Used for first-name-only entries
 * typed in a "Teilnehmer" section ("Alice" → "Person - Alice Anderson").
 *
 * Returns the matched filename when exactly one person matches; returns
 * undefined when zero or multiple match (ambiguity is treated as
 * unmatched on purpose — we will not silently pick one).
 */
export function matchAttendeeBySubstring(
  index: AttendeeIndex,
  needle: string,
): string | undefined {
  const needleTokens = normalizeName(needle).split(' ').filter(t => t.length > 0);
  if (needleTokens.length === 0) return undefined;
  const matches: string[] = [];
  for (const [normalizedName, filename] of Object.entries(index)) {
    const nameTokens = new Set(normalizedName.split(' '));
    if (needleTokens.every(t => nameTokens.has(t))) {
      matches.push(filename);
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

/** Recover the display name embedded in a `Person - {name}.md` filename. */
export function personNameFromFilename(filename: string): string | null {
  const m = filename.match(/^Person - (.+)\.md$/);
  return m ? m[1].trim() : null;
}

/**
 * Scan a markdown body for headings listed in `headings`, capture the
 * bullet items beneath each (until the next heading or EOF), and return
 * the cleaned names. Strips trailing parentheticals
 * ("Sam Sample (CTO, ExampleCorp)" → "Sam Sample").
 *
 * Heading match is case-insensitive on the trimmed text content; any
 * `#`-level (h1–h6) is accepted.
 */
export function extractTypedAttendeeNames(
  summaryMarkdown: string | null,
  headings: string[],
): string[] {
  if (!summaryMarkdown || headings.length === 0) return [];
  const wanted = new Set(headings.map(h => h.trim().toLowerCase()).filter(h => h.length > 0));
  if (wanted.size === 0) return [];

  const out: string[] = [];
  let inSection = false;
  for (const line of summaryMarkdown.split('\n')) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      inSection = wanted.has(headingMatch[1].trim().toLowerCase());
      continue;
    }
    if (!inSection) continue;
    const bullet = line.match(/^\s*(?:[*+-]|\d+\.)\s+(.+)$/);
    if (!bullet) continue;
    const cleaned = bullet[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (cleaned) out.push(cleaned);
  }
  return out;
}

export function generateTag(template: string, name: string): string {
  return template.replace('{name}', name.trim().replace(/\s+/g, '_'));
}

export function shouldExcludeSelf(name: string, myName: string): boolean {
  return myName.trim() !== '' && name.trim().toLowerCase() === myName.trim().toLowerCase();
}
