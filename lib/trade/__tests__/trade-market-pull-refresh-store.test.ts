import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addTradeMarketPullRefreshHandler,
  getTradeMarketPullRefreshSnapshot,
  patchTradeMarketPullRefresh,
  runTradeMarketPullRefresh,
} from "@/lib/trade/trade-market-pull-refresh-store";

describe("runTradeMarketPullRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      requestIdleCallback: undefined,
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    });
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      setTimeout(() => fn(0), 0);
      return 0;
    });
    vi.stubGlobal("document", undefined);
    patchTradeMarketPullRefresh({ pullPx: 0, refreshing: false });
  });

  afterEach(() => {
    patchTradeMarketPullRefresh({ pullPx: 0, refreshing: false });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs only the handler for the current pathname route key", async () => {
    const home = vi.fn(async () => {});
    const vehicle = vi.fn(async () => {});
    const unregHome = addTradeMarketPullRefreshHandler("/market", home);
    const unregVehicle = addTradeMarketPullRefreshHandler(
      "/market/vehicle?topic=phones",
      vehicle
    );

    const p = runTradeMarketPullRefresh(60, "/market/vehicle", new URLSearchParams({ topic: "phones" }));
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ status: "success" });

    expect(home).not.toHaveBeenCalled();
    expect(vehicle).toHaveBeenCalledTimes(1);
    expect(getTradeMarketPullRefreshSnapshot().refreshing).toBe(false);
    expect(getTradeMarketPullRefreshSnapshot().pullPx).toBe(0);

    unregHome();
    unregVehicle();
  });

  it("no-ops when handler is missing for the pathname", async () => {
    expect(await runTradeMarketPullRefresh(60, "/market")).toBe("no_handler");

    expect(getTradeMarketPullRefreshSnapshot().refreshing).toBe(false);
    expect(getTradeMarketPullRefreshSnapshot().pullPx).toBe(0);
  });

  it("missing handler collapses a hint that was left open by the gesture (D3)", async () => {
    patchTradeMarketPullRefresh({ pullPx: 72 });
    expect(await runTradeMarketPullRefresh(72, "/market")).toBe("no_handler");
    expect(getTradeMarketPullRefreshSnapshot()).toMatchObject({ pullPx: 0, phase: "IDLE" });
  });
});
