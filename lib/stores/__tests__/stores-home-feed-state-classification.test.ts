import { describe, expect, it } from "vitest";
import {
  storesHomeEmptySnapKeepsPendingLoading,
  storesHomeShouldArmPendingLoading,
  storesHomeShouldRenderEmptyFallback,
} from "@/lib/stores/stores-home-feed-state-classification";

describe("stores-home-feed-state-classification (D1)", () => {
  it("CASE1: empty snap + inflight → keep PENDING, never READY_EMPTY UI", () => {
    expect(storesHomeEmptySnapKeepsPendingLoading(true)).toBe(true);
    expect(
      storesHomeShouldRenderEmptyFallback({
        loading: true,
        storeCount: 0,
        visibleSlotCount: 0,
      })
    ).toBe(false);
  });

  it("CASE1b: join inflight with no displayable stores still arms PENDING", () => {
    expect(
      storesHomeShouldArmPendingLoading({
        silent: false,
        hasDisplayableStores: false,
      })
    ).toBe(true);
  });

  it("CASE2: settled + stores=[] → READY_EMPTY allowed", () => {
    expect(
      storesHomeShouldRenderEmptyFallback({
        loading: false,
        storeCount: 0,
        visibleSlotCount: 0,
      })
    ).toBe(true);
  });

  it("CASE3: settled + stores>0 → no empty fallback", () => {
    expect(
      storesHomeShouldRenderEmptyFallback({
        loading: false,
        storeCount: 3,
        visibleSlotCount: 1,
      })
    ).toBe(false);
  });

  it("silent refresh does not re-arm pending over existing cards", () => {
    expect(
      storesHomeShouldArmPendingLoading({
        silent: true,
        hasDisplayableStores: false,
      })
    ).toBe(false);
  });
});
