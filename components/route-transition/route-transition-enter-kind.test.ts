import { describe, expect, it } from "vitest";
import { resolveCanonicalNavIndex } from "@/components/route-transition/route-transition-config";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";

describe("resolveCanonicalNavIndex", () => {
  it("does not treat community-messenger as /community (philife)", () => {
    expect(resolveCanonicalNavIndex("/community-messenger")).toBe(3);
    expect(resolveCanonicalNavIndex("/community-messenger/trade-chats")).toBe(3);
    expect(resolveCanonicalNavIndex("/community/foo")).toBe(0);
  });
});

describe("computeRouteTransitionEnterKind", () => {
  it("forward increasing index uses ltr-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/philife", "/market", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("ltr-forward");
    expect(lastForwardAxisRef.current).toBe("ltr");
  });

  it("forward decreasing index uses rtl-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/market", "/philife", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("rtl-forward");
    expect(lastForwardAxisRef.current).toBe("rtl");
  });

  it("same pillar uses subtle", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/market", "/market/foo", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("subtle");
  });

  it("popstate after ltr-forward uses rtl-back", () => {
    const lastForwardAxisRef = { current: "ltr" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/market", "/philife", {
      popstateBack: true,
      lastForwardAxisRef,
    });
    expect(k).toBe("rtl-back");
  });

  it("messenger chat room endpoint suppresses slide", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/community-messenger", "/community-messenger/rooms/abc", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("none");
  });
});
