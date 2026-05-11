import { describe, it, expect, vi } from 'vitest';
import { startPeriodicSync } from '../src/main';

describe('TS4.3 — Interval reset on settings change', () => {
  it('cancels the prior interval and starts a fresh one when periodicIntervalMinutes changes', () => {
    const scheduledIntervals: Array<{ ms: number; id: number }> = [];
    const clearedIds: number[] = [];
    let nextId = 1;
    const schedulerFn = (_cb: () => void, ms: number) => {
      const id = nextId++;
      scheduledIntervals.push({ ms, id });
      return id;
    };
    const clearFn = (id: number) => {
      clearedIds.push(id);
    };

    // Start with a 5-minute interval
    const handle = startPeriodicSync({
      schedulerFn,
      clearFn,
      runSync: vi.fn(),
      periodicIntervalMinutes: 5,
    });

    // Verify the first interval was scheduled at 5 minutes (300_000 ms)
    expect(scheduledIntervals).toHaveLength(1);
    expect(scheduledIntervals[0].ms).toBe(300_000);
    const firstId = scheduledIntervals[0].id;

    // Simulate settings change: cancel the old interval, start a new one at 2 minutes
    handle.cancel();
    startPeriodicSync({
      schedulerFn,
      clearFn,
      runSync: vi.fn(),
      periodicIntervalMinutes: 2,
    });

    // The first interval ID must have been cleared
    expect(clearedIds).toContain(firstId);

    // A new interval must have been registered at 2 minutes (120_000 ms)
    expect(scheduledIntervals).toHaveLength(2);
    expect(scheduledIntervals[1].ms).toBe(120_000);
  });
});
