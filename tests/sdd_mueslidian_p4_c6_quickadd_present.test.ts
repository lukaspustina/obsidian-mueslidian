import { describe, it, expect, vi } from "vitest";
import { handleUnmatchedAttendeeClick } from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("TS4.5 — QuickAdd present integration", () => {
  it("calls executeChoice('Person', { name }) exactly once when QuickAdd api is truthy", async () => {
    const executeChoice = vi.fn(async () => {});
    const app: any = {
      plugins: { plugins: { quickadd: { api: { executeChoice } } } },
    };
    const settings = { ...DEFAULT_SETTINGS };

    await handleUnmatchedAttendeeClick(app, settings, "Alice Wonderland");

    expect(executeChoice).toHaveBeenCalledOnce();
    expect(executeChoice).toHaveBeenCalledWith("Person", { name: "Alice Wonderland" });
  });
});
