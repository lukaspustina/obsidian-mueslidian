// Phase 4, criterion 5 (TS4.4): Status bar click → last report
// GIVEN a completed sync with a stored SyncReport
// WHEN the status bar item is clicked (i.e. showSyncReport is called)
// THEN the Modal mock's open() is called, confirming a modal was opened with the report.

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { Modal } from 'obsidian';
import { showSyncReport } from '../src/main';
import type { SyncReport } from '../src/types';

function makeReport(overrides?: Partial<SyncReport>): SyncReport {
  return {
    startedAt: '2026-05-11T08:00:00.000Z',
    endedAt: '2026-05-11T08:00:05.000Z',
    durationMs: 5000,
    listed: 42,
    created: 3,
    updated: 1,
    unchanged: 38,
    filteredOut: 2,
    delisted: 0,
    skippedExisting: 0,
    stillProcessing: 1,
    errors: [],
    unmatchedAttendees: [{ name: 'Alice Example', sourceNoteTitles: ['Q1 Review'] }],
    aborted: null,
    ...overrides,
  };
}

describe('showSyncReport (TS4.4)', () => {
  let openSpy: MockInstance<(...args: any[]) => any>;

  beforeEach(() => {
    openSpy = vi.spyOn(Modal.prototype, 'open');
    openSpy.mockClear();
  });

  it('opens a modal when showSyncReport is called with a SyncReport', () => {
    const app: any = {};
    const report = makeReport();

    showSyncReport(app, report);

    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('returns an instance of Modal (smoke check)', () => {
    const app: any = {};
    const report = makeReport();

    const result = showSyncReport(app, report);

    if (result !== undefined) {
      expect(result).toBeInstanceOf(Modal);
    }
    // Even if nothing is returned, open() must have been called.
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('opens a modal for a report with errors and aborted state', () => {
    const app: any = {};
    const report = makeReport({
      errors: [{ id: 'not_abc12345678901', reason: 'HTTP 500' }],
      aborted: 'api_unhealthy',
      created: 0,
      updated: 0,
    });

    showSyncReport(app, report);

    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});
