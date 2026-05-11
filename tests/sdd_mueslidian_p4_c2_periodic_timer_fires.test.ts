import { describe, it, expect, vi } from "vitest";
import { startPeriodicSync } from "../src/main";

describe("TS4.1b — Periodic timer fires (injectable scheduler)", () => {
	it("calls runSync exactly once when the scheduler fires after 60s", async () => {
		let savedCallback: () => void;
		let savedMs: number;
		const scheduler = (cb: () => void, ms: number): number => {
			savedCallback = cb;
			savedMs = ms;
			return 42;
		};

		const runSync = vi.fn(async () => {});

		startPeriodicSync({ schedulerFn: scheduler, runSync, periodicIntervalMinutes: 1 });

		expect(savedMs!).toBe(60_000);

		savedCallback!();

		await new Promise((r) => setTimeout(r, 0));

		expect(runSync).toHaveBeenCalledOnce();
		expect(runSync).toHaveBeenCalledWith();
	});
});
