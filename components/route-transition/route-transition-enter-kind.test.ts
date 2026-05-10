import { describe, expect, it } from "vitest";
import { resolveCanonicalNavIndex } from "@/components/route-transition/route-transition-config";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";
import { buildCanonicalNavIndexResolver } from "@/lib/main-menu/canonical-nav-index-resolver";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

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

describe("computeRouteTransitionEnterKind with dynamic resolver", () => {
  /**
   * admin 이 `[stores, community, home, chat, my]` 순서로 저장한 경우의 슬라이드 방향.
   * - /stores → /philife : ixPrev=0, ixNext=1 → ltr-forward (우측 메뉴 선택, 좌→우)
   * - /philife → /stores : ixPrev=1, ixNext=0 → rtl-forward (좌측 메뉴 선택, 우→좌)
   */
  const adminReorderedTabs: BottomNavItemConfig[] = [
    { id: "stores", href: "/stores", label: "배달", icon: "stores" },
    { id: "community", href: "/philife", label: "커뮤니티", icon: "community" },
    { id: "home", href: "/market", label: "거래", icon: "trade" },
    { id: "chat", href: "/community-messenger?section=chats", label: "메신저", icon: "chat" },
    { id: "my", href: "/mypage", label: "내정보", icon: "my" },
  ];
  const resolveIndex = buildCanonicalNavIndexResolver(adminReorderedTabs);

  it("respects admin order — stores→philife is forward to right (ltr-forward)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores", "/philife", {
      popstateBack: false,
      lastForwardAxisRef,
      resolveIndex,
    });
    expect(k).toBe("ltr-forward");
  });

  it("respects admin order — philife→stores is forward to left (rtl-forward)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/philife", "/stores", {
      popstateBack: false,
      lastForwardAxisRef,
      resolveIndex,
    });
    expect(k).toBe("rtl-forward");
  });

  it("dynamic resolver — sub-route (/post/abc) maps to home tab in admin order", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    /** /stores(0) → /post/abc(home=2) → ixNext > ixPrev → ltr-forward */
    const k = computeRouteTransitionEnterKind("/stores", "/post/abc", {
      popstateBack: false,
      lastForwardAxisRef,
      resolveIndex,
    });
    expect(k).toBe("ltr-forward");
  });
});
