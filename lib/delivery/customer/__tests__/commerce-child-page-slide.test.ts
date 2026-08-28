import { describe, expect, it } from "vitest";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";
import {
  computeCommerceChildTransitionKind,
  shouldSuppressCommerceConsumerMainShellSlide,
} from "@/lib/delivery/customer/commerce-child-page-slide";

describe("commerce-child-page-slide", () => {
  it("hub → gift mall uses main shell rtl-forward (not suppressed)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      shouldSuppressCommerceConsumerMainShellSlide("/orders/activity", "/stores/gift-mall")
    ).toBe(false);
    const kind = computeRouteTransitionEnterKind("/orders/activity", "/stores/gift-mall", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(kind).toBe("rtl-forward");
  });

  it("gift mall → product suppresses main shell; child shell rtl-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      shouldSuppressCommerceConsumerMainShellSlide(
        "/stores/gift-mall",
        "/stores/gift-mall/prod-1"
      )
    ).toBe(true);
    const mainKind = computeRouteTransitionEnterKind(
      "/stores/gift-mall",
      "/stores/gift-mall/prod-1",
      { popstateBack: false, lastForwardAxisRef }
    );
    expect(mainKind).toBe("none");
    const childKind = computeCommerceChildTransitionKind(
      "/stores/gift-mall",
      "/stores/gift-mall/prod-1",
      { popstateBack: false, lastForwardAxisRef }
    );
    expect(childKind).toBe("rtl-forward");
  });

  it("product back to mall uses child ltr-back", () => {
    const lastForwardAxisRef = { current: "rtl" as const };
    const childKind = computeCommerceChildTransitionKind(
      "/stores/gift-mall/prod-1",
      "/stores/gift-mall",
      { popstateBack: true, lastForwardAxisRef }
    );
    expect(childKind).toBe("ltr-back");
  });
});
