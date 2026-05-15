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
  deliveryShellEntryBeginNavigation,
  deliveryShellEntryMark,
  resetDeliveryShellEntryTraceForTests,
} from "@/lib/dibay/delivery-shell-entry-trace";

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

describe("delivery-shell-entry-trace", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.mocked(deliveryPerfTraceLog).mockClear();
    vi.stubGlobal("window", { location: { pathname: "/stores/aa11" } });
    store = mockSessionStorage();
    resetDeliveryShellEntryTraceForTests();
    let t = 0;
    vi.stubGlobal("performance", {
      now: () => {
        t += 5;
        return t;
      },
    });
  });

  it("does not mark breakdown done on perceived-only path", () => {
    deliveryShellEntryBeginNavigation("aa11");
    sessionStorage.setItem("dibay:perf:nav_t0", "0");
    sessionStorage.setItem("dibay:perf:nav_slug", "aa11");

    deliveryShellEntryMark("shell_perceived_visible", { slug: "aa11" });

    expect(store.get("dibay:shell-entry-breakdown-done:aa11")).toBeUndefined();
    expect(
      vi.mocked(deliveryPerfTraceLog).mock.calls.some(
        (c) => c[0] === "[delivery-shell-entry-breakdown]"
      )
    ).toBe(false);
  });

  it("emits breakdown only after shell_visible with phases filled", () => {
    deliveryShellEntryBeginNavigation("aa11");
    sessionStorage.setItem("dibay:perf:nav_t0", "0");
    sessionStorage.setItem("dibay:perf:nav_slug", "aa11");

    deliveryShellEntryMark("card_tap", {
      slug: "aa11",
      prefetch_hit: true,
      prefetch_age_ms: 120,
    });
    deliveryShellEntryMark("router_push_start", { slug: "aa11" });
    deliveryShellEntryMark("detail_page_enter", { slug: "aa11" });
    deliveryShellEntryMark("client_mount_start", { slug: "aa11" });
    deliveryShellEntryMark("shell_rendered", { slug: "aa11" });
    deliveryShellEntryMark("shell_visible", { slug: "aa11" });

    expect(store.get("dibay:shell-entry-breakdown-done:aa11")).toBe("1");

    const breakdownCall = vi.mocked(deliveryPerfTraceLog).mock.calls.find(
      (c) => c[0] === "[delivery-shell-entry-breakdown]"
    );
    expect(breakdownCall).toBeDefined();
    const payload = breakdownCall?.[1] as Record<string, unknown>;
    expect(payload.tap_to_push_ms).toBe(5);
    expect(payload.push_to_page_enter_ms).toBe(5);
    expect(payload.tap_to_route_shell_visible_ms).toBe(30);
    expect(payload.had_perceived_overlay).toBe(false);
    expect(payload.was_prefetched).toBe(true);
    expect(payload.prefetch_age_ms).toBe(120);
    expect((payload.missing_phases as string[]).includes("shell_perceived_visible")).toBe(
      true
    );
  });
});
