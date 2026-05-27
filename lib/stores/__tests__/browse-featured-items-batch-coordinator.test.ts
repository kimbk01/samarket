import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubVitestMinimalWindow } from "@/lib/test-utils/vitest-minimal-window";
import {
  resetBrowseFeaturedItemsBatchCoordinatorForTests,
  scheduleBrowseFeaturedItemsBatch,
} from "@/lib/stores/browse-featured-items-batch-coordinator";

vi.mock("@/lib/stores/fetch-browse-featured-items-client", () => ({
  fetchBrowseFeaturedItemsBatch: vi.fn(async (storeIds: string[]) => {
    const byStoreId = new Map(storeIds.map((id) => [id, []]));
    return { byStoreId, cacheHits: 0 };
  }),
}));

describe("scheduleBrowseFeaturedItemsBatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubVitestMinimalWindow();
    resetBrowseFeaturedItemsBatchCoordinatorForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetBrowseFeaturedItemsBatchCoordinatorForTests();
    vi.useRealTimers();
  });

  it("merges concurrent requests into one fetch", async () => {
    const { fetchBrowseFeaturedItemsBatch } = await import(
      "@/lib/stores/fetch-browse-featured-items-client"
    );
    const p1 = scheduleBrowseFeaturedItemsBatch(["a", "b"]);
    const p2 = scheduleBrowseFeaturedItemsBatch(["b", "c"]);
    await vi.advanceTimersByTimeAsync(48);
    await Promise.all([p1, p2]);
    expect(fetchBrowseFeaturedItemsBatch).toHaveBeenCalledTimes(1);
    expect(fetchBrowseFeaturedItemsBatch).toHaveBeenCalledWith(["a", "b", "c"]);
  });
});
