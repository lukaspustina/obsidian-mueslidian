import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyOnReport } from "../src/main";
import type { SyncReport } from "../src/types";

const reportNoChange: SyncReport = {
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:00.100Z",
  durationMs: 100,
  listed: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  filteredOut: 0,
  delisted: 0,
  skippedExisting: 0,
  stillProcessing: 0,
  errors: [],
  unmatchedAttendees: [],
  aborted: null,
};

describe("TS4.2 — Periodic silent on no-change", () => {
  let noticeCalls: string[];
  let NoticeStub: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

  beforeEach(() => {
    noticeCalls = [];
    NoticeStub = vi.fn(function (this: unknown, msg: string) {
      noticeCalls.push(msg);
    });
    vi.stubGlobal("Notice", NoticeStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires no Notice when trigger is periodic and no changes occurred", () => {
    notifyOnReport(reportNoChange, "periodic");
    expect(noticeCalls.length).toBe(0);
  });

  it("fires at least one Notice when trigger is manual and no changes occurred", () => {
    notifyOnReport(reportNoChange, "manual");
    expect(noticeCalls.length).toBeGreaterThanOrEqual(1);
  });
});
