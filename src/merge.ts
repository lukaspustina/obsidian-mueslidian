import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

export const MANAGED_KEY_ORDER: readonly string[] = [
  'granola_id',
  'granola_updated_at',
  'granola_synced_at',
  'granola_folders',
  'title',
  'date',
  'event_title',
  'meeting_start',
  'meeting_end',
  'owner_name',
  'owner_email',
  'organiser',
  'attendees',
  'invitees',
  'unscheduled_attendees',
  'calendar_event_id',
  'web_url',
  'tags',
];

export const MANAGED_KEYS: ReadonlySet<string> = new Set(MANAGED_KEY_ORDER);

export function serializeFrontmatter(fm: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const k of MANAGED_KEY_ORDER) {
    if (k in fm) ordered[k] = fm[k];
  }
  for (const k of Object.keys(fm)) {
    if (!(k in ordered)) ordered[k] = fm[k];
  }
  return yamlDump(ordered, { lineWidth: -1, noRefs: true });
}

export function splitFrontmatter(content: string): { fm: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { fm: {}, body: content };
  }
  let parsed: unknown;
  try {
    parsed = yamlLoad(match[1]);
  } catch {
    parsed = null;
  }
  const fm = (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
    ? (parsed as Record<string, unknown>)
    : {};
  return { fm, body: match[2] };
}

export function replaceMarkerBlock(
  body: string,
  name: 'meta' | 'enhanced' | 'transcript',
  newBlock: string
): string {
  const startMarker = `<!-- granola:${name}:start -->`;
  const endMarker = `<!-- granola:${name}:end -->`;

  const startIdx = body.indexOf(startMarker);
  if (startIdx === -1) return body;

  const endIdx = body.indexOf(endMarker, startIdx);
  if (endIdx !== -1) {
    const endFull = endIdx + endMarker.length;
    // Consume a trailing newline if present
    const afterEnd = body[endFull] === '\n' ? endFull + 1 : endFull;
    return body.slice(0, startIdx) + newBlock + body.slice(afterEnd);
  }

  // Malformed: no end marker — find next start or EOF
  const nextStartMatch = /<!-- granola:[a-z]+:start -->/g;
  nextStartMatch.lastIndex = startIdx + startMarker.length;
  const nextMatch = nextStartMatch.exec(body);
  const cutEnd = nextMatch ? nextMatch.index : body.length;
  return body.slice(0, startIdx) + newBlock + body.slice(cutEnd);
}

type BlockName = 'meta' | 'enhanced' | 'transcript';
const BLOCK_NAMES: readonly BlockName[] = ['meta', 'enhanced', 'transcript'];

function extractBlock(body: string, name: BlockName): string | null {
  const startMarker = `<!-- granola:${name}:start -->`;
  const endMarker = `<!-- granola:${name}:end -->`;
  const startIdx = body.indexOf(startMarker);
  if (startIdx === -1) return null;
  const endIdx = body.indexOf(endMarker, startIdx);
  if (endIdx === -1) return null;
  const endFull = endIdx + endMarker.length;
  // Include trailing newline in the captured block
  const afterEnd = body[endFull] === '\n' ? endFull + 1 : endFull;
  return body.slice(startIdx, afterEnd);
}

/**
 * Extract the namespace prefix from an attendee-tag template.
 * For "person/{name}" returns "person"; for "people/{name}" returns "people".
 * Returns null when the template has no namespace separator.
 */
export function attendeeTagPrefix(template: string): string | null {
  const slash = template.indexOf('/');
  if (slash <= 0) return null;
  return template.slice(0, slash);
}

export function mergeMeetingFile(
  existing: string,
  rendered: string,
  /**
   * Current `attendeeTagTemplate` prefix (e.g. "person"). When provided,
   * stale tags under this prefix are removed even when the rendered tags
   * list is empty (FR19 strict reading). When omitted, the namespace is
   * derived from `renderedTags[0]` (legacy heuristic; only works when at
   * least one matched attendee is present).
   */
  attendeeTagNamespace?: string,
): string {
  const e = splitFrontmatter(existing);
  const r = splitFrontmatter(rendered);

  // --- Frontmatter merge ---
  const merged: Record<string, unknown> = { ...e.fm };

  // Overwrite with rendered values (except tags — handled separately)
  for (const key of Object.keys(r.fm)) {
    if (key !== 'tags') {
      merged[key] = r.fm[key];
    }
  }

  // Remove managed keys present in existing but absent in rendered
  for (const key of MANAGED_KEY_ORDER) {
    if (key === 'tags') continue;
    if (key in e.fm && !(key in r.fm)) {
      delete merged[key];
    }
  }

  // --- Tags merge ---
  const renderedTags = Array.isArray(r.fm['tags']) ? (r.fm['tags'] as string[]) : [];
  const existingTags = Array.isArray(e.fm['tags']) ? (e.fm['tags'] as string[]) : [];

  // Determine the namespace to clean. Explicit > inferred from rendered.
  const namespace =
    attendeeTagNamespace ??
    (renderedTags.length > 0 ? renderedTags[0].split('/')[0] : null);

  if (namespace === null) {
    // No way to determine the namespace; preserve existing tags + add any rendered.
    merged['tags'] = renderedTags.length > 0
      ? [...existingTags.filter(t => !renderedTags.includes(t)), ...renderedTags]
      : existingTags;
  } else {
    const kept = existingTags.filter(t => t.split('/')[0] !== namespace);
    merged['tags'] = [...kept, ...renderedTags];
  }

  // --- Body merge (marker blocks) ---
  let body = e.body;

  for (const name of BLOCK_NAMES) {
    const renderedBlock = extractBlock(r.body, name);
    const existingBlock = extractBlock(body, name);

    if (renderedBlock !== null && existingBlock !== null) {
      // Replace existing with rendered
      body = replaceMarkerBlock(body, name, renderedBlock);
    } else if (renderedBlock !== null && existingBlock === null) {
      // Insert rendered block — append after body (separated by newline)
      if (!body.endsWith('\n')) body += '\n';
      body += renderedBlock;
    }
    // rendered absent, existing present → keep (do nothing)
    // both absent → nothing
  }

  const fmYaml = serializeFrontmatter(merged);
  return `---\n${fmYaml}---\n${body}`;
}
