import type { AttendeeIndex, MuesliSettings } from './types.js';

export type { AttendeeIndex };

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Phase 2 stub — real scan in Phase 3.
export function buildAttendeeIndex(_app: unknown, _settings: MuesliSettings): AttendeeIndex {
  return {};
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
