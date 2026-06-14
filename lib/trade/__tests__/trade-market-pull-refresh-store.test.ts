import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubVitestMinimalWindow } from "@/lib/test-utils/vitest-minimal-window";
import {
  addTradeMarketPullRefreshHandler,
  getTradeMarketPullRefreshSnapshot,
  patchTradeMarketPullRefresh,
  runTradeMarketPullRefresh,
} from "@/lib/trade/trade-market-pull-refresh-store";

describe("runTradeMarketPullRefresh", () => {
  beforeEach(() => {
    stubVitestMinimalWindow({
      setTimeout: ((fn: () => void) => {
        fn();
        return 0;
      }) as typeof setTimeout,
      requestAnimationFrame: (fn: FrameRequestCallback) => {
        fn(0);
        return 0;
      },
    });
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
    patchTradeMarketPullRefresh({ pullPx: 0, refreshing: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    patchTradeMarketPullRefresh({ pullPx: 0, refreshing: false });
  });

  it("runs only the handler for the current pathname route key", async () => {
    const home = vi.fn(async () => {});
    const vehicle = vi.fn(async () => {});
    const unregHome = addTradeMarketPullRefreshHandler("/market", home);
    const unregVehicle = addTradeMarketPullRefreshHandler(
      "/market/vehicle?topic=phones",
      vehicle
    );

    await runTradeMarketPullRefresh(60, "/market/vehicle", new URLSearchParams({ topic: "phones" }));

    expect(home).not.toHaveBeenCalled();
    expect(vehicle).toHaveBeenCalledTimes(1);
    expect(getTradeMarketPullRefreshSnapshot().refreshing).toBe(false);
    expect(getTradeMarketPullRefreshSnapshot().pullPx).toBe(0);

    unregHome();
    unregVehicle();
  });

  it("no-ops when handler is missing for the pathname", async () => {
    await runTradeMarketPullRefresh(60, "/market");

    expect(getTradeMarketPullRefreshSnapshot().refreshing).toBe(false);
    expect(getTradeMarketPullRefreshSnapshot().pullPx).toBe(0);
  });
});
