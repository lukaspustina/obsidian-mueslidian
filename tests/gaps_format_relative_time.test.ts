import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../src/main';

describe('formatRelativeTime (AC15 component)', () => {
  it('returns "never" when lastSyncAt is null', () => {
    expect(formatRelativeTime(null, 1_700_000_000_000)).toBe('never');
  });

  it('renders seconds when < 1 minute', () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(new Date(now - 30_000).toISOString(), now)).toBe('30s ago');
  });

  it('renders minutes when ≥ 1 minute and < 1 hour', () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(new Date(now - 2 * 60_000).toISOString(), now)).toBe('2 min ago');
    expect(formatRelativeTime(new Date(now - 59 * 60_000).toISOString(), now)).toBe('59 min ago');
  });

  it('renders hours when ≥ 1 hour and < 24 hours', () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 hr ago');
  });

  it('renders ">24 hr ago" when older than a day', () => {
    const now = 1_700_000_000_000;
    expect(
      formatRelativeTime(new Date(now - 48 * 3_600_000).toISOString(), now),
    ).toBe('>24 hr ago');
  });
});
