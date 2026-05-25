import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTrailingCoalescedCallback } from "@/lib/http/coalesce-trailing-callback";
import { resetFetchStormTraceForTests } from "@/lib/dibay/network-fetch-storm-trace";

describe("network fetch storm dedupe helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFetchStormTraceForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces trailing callback burst into one invocation", () => {
    const fn = vi.fn();
    const { schedule, cancel } = createTrailingCoalescedCallback(fn, 1_200);

    schedule();
    schedule();
    schedule();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_200);
    expect(fn).toHaveBeenCalledTimes(1);

    cancel();
  });
});
