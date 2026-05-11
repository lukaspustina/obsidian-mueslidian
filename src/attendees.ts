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

export function generateTag(template: string, name: string): string {
  return template.replace('{name}', name.trim().replace(/\s+/g, '_'));
}

export function shouldExcludeSelf(name: string, myName: string): boolean {
  return myName.trim() !== '' && name.trim().toLowerCase() === myName.trim().toLowerCase();
}
