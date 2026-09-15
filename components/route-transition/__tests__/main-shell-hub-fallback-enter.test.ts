import { describe, expect, it } from "vitest";
import { shouldUseMainShellHubFallbackEnter } from "@/components/route-transition/main-shell-hub-fallback-enter";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";
import { routeTransitionPushAxisForKind } from "@/components/route-transition/route-transition-config";

describe("shouldUseMainShellHubFallbackEnter", () => {
  it("hub chrome present keeps fallback enter eligible", () => {
    expect(
      shouldUseMainShellHubFallbackEnter({
        hubChromeHeaderPresent: true,
        mainShellChildScrollLocked: false,
      })
    ).toBe(true);
  });

  it("cart forward: hubChromeHeader absent + child-scroll lock still eligible", () => {
    expect(
      shouldUseMainShellHubFallbackEnter({
        hubChromeHeaderPresent: false,
        mainShellChildScrollLocked: true,
      })
    ).toBe(true);
  });

  it("neither hub chrome nor child-scroll lock → not hub-fallback eligible", () => {
    expect(
      shouldUseMainShellHubFallbackEnter({
        hubChromeHeaderPresent: false,
        mainShellChildScrollLocked: false,
      })
    ).toBe(false);
  });

  it("store → cart resolver stays rtl-forward (RIGHT→LEFT axis)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const kind = computeRouteTransitionEnterKind("/stores/aa11", "/stores/aa11/cart", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(kind).toBe("rtl-forward");
    expect(routeTransitionPushAxisForKind(kind)).toBe("rtl");
    expect(
      shouldUseMainShellHubFallbackEnter({
        hubChromeHeaderPresent: false,
        mainShellChildScrollLocked: true,
      })
    ).toBe(true);
  });

  it("cart → store back resolver stays ltr-back (LEFT→RIGHT axis)", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const kind = computeRouteTransitionEnterKind("/stores/aa11/cart", "/stores/aa11", {
      popstateBack: true,
      lastForwardAxisRef,
    });
    expect(kind).toBe("ltr-back");
    expect(routeTransitionPushAxisForKind(kind)).toBe("ltr");
  });
});
