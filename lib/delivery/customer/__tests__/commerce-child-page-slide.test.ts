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

  it("store product → cart → checkout uses child rtl-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      shouldSuppressCommerceConsumerMainShellSlide(
        "/stores/test-store/p/prod-1",
        "/stores/test-store/cart"
      )
    ).toBe(true);
    expect(
      computeCommerceChildTransitionKind("/stores/test-store/p/prod-1", "/stores/test-store/cart", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("rtl-forward");
    expect(
      computeCommerceChildTransitionKind("/stores/test-store/cart", "/stores/test-store/checkout", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("rtl-forward");
  });

  it("checkout back to cart uses child ltr-back", () => {
    const lastForwardAxisRef = { current: "rtl" as const };
    expect(
      computeCommerceChildTransitionKind("/stores/test-store/checkout", "/stores/test-store/cart", {
        popstateBack: true,
        lastForwardAxisRef,
      })
    ).toBe("ltr-back");
  });

  it("committed order chat route stays in the commerce stack and never points back to checkout", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      shouldSuppressCommerceConsumerMainShellSlide("/stores/test-store/checkout", "/orders/store/order-1/chat")
    ).toBe(false);
    expect(
      computeRouteTransitionEnterKind("/stores/test-store/checkout", "/orders/store/order-1/chat", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("rtl-forward");
  });
});
