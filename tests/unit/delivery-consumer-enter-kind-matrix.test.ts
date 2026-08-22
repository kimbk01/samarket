import { describe, expect, it } from "vitest";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";
import {
  routeTransitionClassForKind,
  routeTransitionPushAxisForKind,
} from "@/components/route-transition/route-transition-config";

/** CUT-C — delivery consumer drill-down must use full-page RTL forward / LTR back. */
describe("delivery consumer enter-kind matrix", () => {
  const cases = [
    ["/stores", "/stores/browse/restaurant", "rtl-forward"],
    ["/stores", "/stores/browse/cafe", "rtl-forward"],
    ["/stores/browse/restaurant", "/stores/aa11", "rtl-forward"],
    ["/stores", "/stores/aa11", "rtl-forward"],
    ["/stores/aa11", "/stores", "ltr-back"],
    ["/stores/browse/restaurant", "/stores", "ltr-back"],
    ["/stores", "/stores/cart", "rtl-forward"],
    ["/stores/browse/restaurant", "/stores/browse/cafe", "subtle"],
    ["/market", "/stores", "rtl-forward"],
  ] as const;

  for (const [from, to, expected] of cases) {
    it(`${from} -> ${to} = ${expected}`, () => {
      const ref = { current: null as "ltr" | "rtl" | null };
      const k = computeRouteTransitionEnterKind(from, to, {
        popstateBack: false,
        lastForwardAxisRef: ref,
      });
      expect(k).toBe(expected);
      if (expected === "rtl-forward") {
        expect(routeTransitionClassForKind(k)).toBe("main-shell-route-enter-rtl-forward");
        expect(routeTransitionPushAxisForKind(k)).toBe("rtl");
      }
      if (expected === "ltr-back") {
        expect(routeTransitionClassForKind(k)).toBe("main-shell-route-enter-ltr-back");
        expect(routeTransitionPushAxisForKind(k)).toBe("ltr");
      }
    });
  }

  it("popstate back from store to hub uses ltr-back", () => {
    const ref = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores/aa11", "/stores", {
      popstateBack: true,
      lastForwardAxisRef: ref,
    });
    expect(k).toBe("ltr-back");
  });
});
