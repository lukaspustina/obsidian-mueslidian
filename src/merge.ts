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

/**
 * Marker delimiters recognized when READING an existing file. Whichever
 * style appears first wins. New writes use the configured `markerSyntax`
 * setting via `renderMeeting`, so files migrate gradually on re-sync.
 */
function findStartMarker(body: string, name: BlockName): { idx: number; len: number } | null {
  const html = `<!-- granola:${name}:start -->`;
  const obs = `%% granola:${name}:start %%`;
  const hIdx = body.indexOf(html);
  const oIdx = body.indexOf(obs);
  if (hIdx === -1 && oIdx === -1) return null;
  if (hIdx === -1) return { idx: oIdx, len: obs.length };
  if (oIdx === -1) return { idx: hIdx, len: html.length };
  // Both present (shouldn't happen in practice) — take the earlier one.
  return hIdx < oIdx ? { idx: hIdx, len: html.length } : { idx: oIdx, len: obs.length };
}

function findEndMarker(
  body: string,
  name: BlockName,
  fromIdx: number,
): { idx: number; len: number } | null {
  const html = `<!-- granola:${name}:end -->`;
  const obs = `%% granola:${name}:end %%`;
  const hIdx = body.indexOf(html, fromIdx);
  const oIdx = body.indexOf(obs, fromIdx);
  if (hIdx === -1 && oIdx === -1) return null;
  if (hIdx === -1) return { idx: oIdx, len: obs.length };
  if (oIdx === -1) return { idx: hIdx, len: html.length };
  return hIdx < oIdx ? { idx: hIdx, len: html.length } : { idx: oIdx, len: obs.length };
}

/** Regex matching either marker style's `*:start` for ANY block name. */
const ANY_START_RE = /(?:<!-- granola:[a-z]+:start -->|%% granola:[a-z]+:start %%)/g;

export function replaceMarkerBlock(
  body: string,
  name: 'meta' | 'enhanced' | 'transcript',
  newBlock: string
): string {
  const start = findStartMarker(body, name);
  if (start === null) return body;

  const end = findEndMarker(body, name, start.idx + start.len);
  if (end !== null) {
    const endFull = end.idx + end.len;
    // Consume a trailing newline if present
    const afterEnd = body[endFull] === '\n' ? endFull + 1 : endFull;
    return body.slice(0, start.idx) + newBlock + body.slice(afterEnd);
  }

  // Malformed: no end marker — find next ANY-style start or EOF
  ANY_START_RE.lastIndex = start.idx + start.len;
  const nextMatch = ANY_START_RE.exec(body);
  const cutEnd = nextMatch ? nextMatch.index : body.length;
  return body.slice(0, start.idx) + newBlock + body.slice(cutEnd);
}

type BlockName = 'meta' | 'enhanced' | 'transcript';
const BLOCK_NAMES: readonly BlockName[] = ['meta', 'enhanced', 'transcript'];

/**
 * R10: insert `newBlock` immediately after the closest preceding marker
 * block's `:end` marker (per BLOCK_NAMES ordering). When no preceding
 * block is present in `body`, the new block is placed at the start of
 * `body` (which sits right after the frontmatter `---` in the merged
 * file). `newBlock` is normalized to end with a single newline.
 */
function insertBlockAfterPrevious(
  body: string,
  currentName: BlockName,
  newBlock: string,
): string {
  const idx = BLOCK_NAMES.indexOf(currentName);
  const insertion = newBlock.endsWith('\n') ? newBlock : newBlock + '\n';

  for (let i = idx - 1; i >= 0; i--) {
    const prev = BLOCK_NAMES[i];
    const end = findEndMarker(body, prev, 0);
    if (end !== null) {
      const afterEnd = end.idx + end.len;
      // Step past a trailing newline so the new block starts on its own line.
      const cut = body[afterEnd] === '\n' ? afterEnd + 1 : afterEnd;
      return body.slice(0, cut) + insertion + body.slice(cut);
    }
  }

  // No preceding block present → put it at the very start of the body
  // (which immediately follows the YAML frontmatter close).
  return insertion + body;
}

function extractBlock(body: string, name: BlockName): string | null {
  const start = findStartMarker(body, name);
  if (start === null) return null;
  const end = findEndMarker(body, name, start.idx + start.len);
  if (end === null) return null;
  const endFull = end.idx + end.len;
  // Include trailing newline in the captured block
  const afterEnd = body[endFull] === '\n' ? endFull + 1 : endFull;
  return body.slice(start.idx, afterEnd);
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

/**
 * R11: return true when an existing file body contains the literal string
 * `## My Notes` outside every `<!-- granola:*:* -->` marker block. Used by
 * the caller to suppress placeholder re-emission on re-sync.
 */
export function hasMyNotesOutsideMarkers(body: string): boolean {
  // Strip every marker block (start...end) from the body, then check.
  // Both HTML and Obsidian marker styles are recognized.
  let cleaned = body;
  for (const name of BLOCK_NAMES) {
    const htmlRe = new RegExp(
      `<!-- granola:${name}:start -->[\\s\\S]*?<!-- granola:${name}:end -->`,
      'g',
    );
    const obsRe = new RegExp(
      `%% granola:${name}:start %%[\\s\\S]*?%% granola:${name}:end %%`,
      'g',
    );
    cleaned = cleaned.replace(htmlRe, '').replace(obsRe, '');
  }
  return cleaned.includes('## My Notes');
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
      // R10: insert the missing block immediately after the preceding
      // block's `:end` marker — or at the start of the body if no prior
      // block exists. BLOCK_NAMES is iterated in source order, so any
      // earlier block this iteration may have inserted is already in
      // `body`.
      body = insertBlockAfterPrevious(body, name, renderedBlock);
    }
    // rendered absent, existing present → keep (do nothing)
    // both absent → nothing
  }

  const fmYaml = serializeFrontmatter(merged);
  return `---\n${fmYaml}---\n${body}`;
}
