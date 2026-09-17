import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGlobalSearchCoordinator,
  GLOBAL_SEARCH_DEBOUNCE_MS,
  trimGlobalSearchQuery,
} from "@/lib/search/global/coordinate-search";

describe("global search coordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("trims empty and collapses whitespace", () => {
    expect(trimGlobalSearchQuery("  치킨  ")).toBe("치킨");
    expect(trimGlobalSearchQuery("  ")).toBe("");
    expect(trimGlobalSearchQuery("fried   chicken")).toBe("fried chicken");
    expect(trimGlobalSearchQuery(null)).toBe("");
  });

  it("debounces schedule and drops stale seq", () => {
    vi.useFakeTimers();
    const coord = createGlobalSearchCoordinator();
    const run = vi.fn();
    coord.schedule(run);
    coord.schedule(run);
    vi.advanceTimersByTime(GLOBAL_SEARCH_DEBOUNCE_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    const first = coord.beginRequest();
    const second = coord.beginRequest();
    expect(coord.isCurrent(first.seq)).toBe(false);
    expect(coord.isCurrent(second.seq)).toBe(true);
  });
});
