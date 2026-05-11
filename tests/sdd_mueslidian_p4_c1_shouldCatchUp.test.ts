import { describe, it, expect } from "vitest";
import { shouldCatchUp } from "../src/main";

describe("shouldCatchUp", () => {
  it("returns true when lastSyncAt is exactly intervalMinutes minutes before nowMs", () => {
    const nowMs = 1_700_000_000_000;
    const lastSyncAt = new Date(nowMs - 5 * 60_000).toISOString();
    expect(shouldCatchUp(lastSyncAt, 5, nowMs)).toBe(true);
  });

  it("returns false when lastSyncAt is within the interval", () => {
    const nowMs = 1_700_000_000_000;
    const lastSyncAt = new Date(nowMs - 2 * 60_000).toISOString();
    expect(shouldCatchUp(lastSyncAt, 5, nowMs)).toBe(false);
  });

  it("returns false when intervalMinutes === 0", () => {
    const nowMs = 1_700_000_000_000;
    const lastSyncAt = new Date(nowMs - 60 * 60_000).toISOString();
    expect(shouldCatchUp(lastSyncAt, 0, nowMs)).toBe(false);
  });
});
