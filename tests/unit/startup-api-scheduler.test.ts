import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetStartupApiDeferredForTests,
  scheduleStartupApiDeferred,
} from "@/lib/http/startup-api-scheduler";

describe("startup-api-scheduler dedupe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T00:00:00.000Z"));
    resetStartupApiDeferredForTests();
    vi.stubGlobal("window", {
      setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
      clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
      location: { pathname: "/home" },
    });
    vi.stubGlobal("document", {
      visibilityState: "visible",
    });
    vi.stubGlobal("requestIdleCallback", undefined);
  });

  afterEach(() => {
    resetStartupApiDeferredForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("executes the same jobId once and skips within TTL", () => {
    const run = vi.fn();

    scheduleStartupApiDeferred("notification-settings-my-inbox", run, { delayMs: 120 });
    vi.advanceTimersByTime(120);
    expect(run).toHaveBeenCalledTimes(1);

    scheduleStartupApiDeferred("notification-settings-my-inbox", run, { delayMs: 120 });
    vi.advanceTimersByTime(120);
    expect(run).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(20_000);
    scheduleStartupApiDeferred("notification-settings-my-inbox", run, { delayMs: 120 });
    vi.advanceTimersByTime(120);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("joins pending runs for the same jobId before execution", () => {
    const first = vi.fn();
    const second = vi.fn();

    scheduleStartupApiDeferred("notification-settings-philife-inbox", first, { delayMs: 100 });
    scheduleStartupApiDeferred("notification-settings-philife-inbox", second, { delayMs: 100 });

    vi.advanceTimersByTime(100);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps the pending timer across subscriber cleanup (Strict remount)", () => {
    const first = vi.fn();
    const second = vi.fn();

    const cancelFirst = scheduleStartupApiDeferred("notification-settings-my-inbox", first, {
      delayMs: 120,
    });
    cancelFirst();
    scheduleStartupApiDeferred("notification-settings-my-inbox", second, { delayMs: 120 });

    vi.advanceTimersByTime(120);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
