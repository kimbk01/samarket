import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/dibay/delivery-perf-trace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dibay/delivery-perf-trace")>();
  return {
    ...actual,
    deliveryPerfTraceEnabled: () => true,
    deliveryPerfTraceLog: vi.fn(),
  };
});

import { deliveryPerfTraceLog } from "@/lib/dibay/delivery-perf-trace";
import {
  deliveryMenuVisibleMarkFetchStart,
  deliveryMenuVisibleMarkFirstSectionReady,
  deliveryMenuVisibleMarkFirstVisible,
  deliveryMenuVisibleMarkMenuDataReady,
  deliveryMenuVisibleMarkNormalizeComplete,
  deliveryMenuVisibleBeginNavSession,
  resetDeliveryMenuVisibleTraceForTests,
} from "@/lib/dibay/delivery-menu-visible-trace";

function mockSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    key: () => null,
    length: store.size,
    clear: () => store.clear(),
  });
  return store;
}

describe("delivery-menu-visible-trace", () => {
  beforeEach(() => {
    vi.mocked(deliveryPerfTraceLog).mockClear();
    vi.stubGlobal("window", { location: { pathname: "/stores/aa11" } });
    mockSessionStorage();
    resetDeliveryMenuVisibleTraceForTests();
    let t = 0;
    vi.stubGlobal("performance", {
      now: () => {
        t += 8;
        return t;
      },
    });
    sessionStorage.setItem("dibay:perf:nav_t0", "0");
    sessionStorage.setItem("dibay:perf:nav_slug", "aa11");
    sessionStorage.setItem(
      "dibay:shell-entry-phases:aa11",
      JSON.stringify({ shell_visible: 20 })
    );
  });

  it("emits menu_visible_breakdown after first_visible", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    deliveryMenuVisibleBeginNavSession("aa11");
    deliveryMenuVisibleMarkFetchStart("aa11");
    deliveryMenuVisibleMarkMenuDataReady("aa11");
    deliveryMenuVisibleMarkNormalizeComplete("aa11", 12);
    deliveryMenuVisibleMarkFirstSectionReady("aa11", 3);
    deliveryMenuVisibleMarkFirstVisible("aa11", "test");
    await new Promise<void>((r) => queueMicrotask(r));

    const breakdown = vi.mocked(deliveryPerfTraceLog).mock.calls.find(
      (c) => c[0] === "[delivery-menu-visible-breakdown]"
    );
    expect(breakdown).toBeDefined();
    expect(breakdown?.[1]).toMatchObject({
      event: "menu_visible_breakdown",
      slug: "aa11",
      menu_fetch_ms: expect.any(Number),
      normalize_ms: 12,
      apply_ms: expect.any(Number),
      tap_to_menu_first_visible_ms: expect.any(Number),
    });
  });
});
