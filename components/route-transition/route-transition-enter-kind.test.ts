import { describe, expect, it } from "vitest";
import {
  resolveCanonicalNavIndex,
  routeTransitionPushAxisForKind,
} from "@/components/route-transition/route-transition-config";
import {
  computeRouteTransitionEnterKind,
  computeStoresOwnerStackTransitionKind,
} from "@/components/route-transition/route-transition-enter-kind";
import { buildCanonicalNavIndexResolver } from "@/lib/main-menu/canonical-nav-index-resolver";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

describe("routeTransitionPushAxisForKind", () => {
  it("좌측 탭 → ltr push (좌→우)", () => {
    expect(routeTransitionPushAxisForKind("ltr-forward")).toBe("ltr");
  });

  it("우측 탭 → rtl push (우→좌)", () => {
    expect(routeTransitionPushAxisForKind("rtl-forward")).toBe("rtl");
  });

  it("subtle·none → push 없음", () => {
    expect(routeTransitionPushAxisForKind("subtle")).toBeNull();
    expect(routeTransitionPushAxisForKind("none")).toBeNull();
  });
});

describe("resolveCanonicalNavIndex", () => {
  it("does not treat community-messenger as /community (philife)", () => {
    expect(resolveCanonicalNavIndex("/community-messenger")).toBe(3);
    expect(resolveCanonicalNavIndex("/community-messenger/trade-chats")).toBe(3);
    expect(resolveCanonicalNavIndex("/community/foo")).toBe(0);
  });
});

describe("computeRouteTransitionEnterKind", () => {
  it("forward increasing index uses rtl-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/philife", "/market", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("rtl-forward");
    expect(lastForwardAxisRef.current).toBe("rtl");
  });

  it("forward decreasing index uses ltr-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/market", "/philife", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("ltr-forward");
    expect(lastForwardAxisRef.current).toBe("ltr");
  });

  it("same pillar uses subtle", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/market", "/market/foo", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("subtle");
  });

  it("popstate after rtl-forward uses ltr-back", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/market", "/philife", {
      popstateBack: true,
      lastForwardAxisRef,
    });
    expect(k).toBe("ltr-back");
  });

  it("messenger chat room endpoint suppresses slide", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/community-messenger", "/community-messenger/rooms/abc", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("none");
  });

  it("stores owner stack internal nav suppresses main-shell slide (OwnerStackPageSlideShell)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores/owner", "/stores/owner/orders", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("none");
  });

  it("stores owner hub to child: main shell none, OwnerStackPageSlideShell rtl-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const mainShell = computeRouteTransitionEnterKind("/stores/owner", "/stores/owner/orders", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(mainShell).toBe("none");
    const stackKind = computeStoresOwnerStackTransitionKind("/stores/owner", "/stores/owner/orders", {
      popstateBack: false,
      lastForwardAxisRef: { current: null },
    });
    expect(stackKind).toBe("rtl-forward");
  });

  it("stores owner child to hub uses ltr-back without popstate (좌→우)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const mainShell = computeRouteTransitionEnterKind("/stores/owner/orders", "/stores/owner", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(mainShell).toBe("none");
    const stackKind = computeStoresOwnerStackTransitionKind("/stores/owner/orders", "/stores/owner", {
      popstateBack: false,
      lastForwardAxisRef: { current: null },
    });
    expect(stackKind).toBe("ltr-back");
  });

  it("leaving stores owner stack to non-stack uses ltr-back", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores/owner/orders", "/philife", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("ltr-back");
  });

  it("stores owner apply path is excluded from stack slide rules", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores", "/stores/owner/apply", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("subtle");
  });

  it("mypage to store owner apply uses 370ms store-apply-forward (rtl)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/mypage", "/stores/owner/apply", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("store-apply-forward");
    expect(lastForwardAxisRef.current).toBe("rtl");
  });

  it("store owner apply back to mypage uses store-apply-back (ltr)", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores/owner/apply", "/mypage", {
      popstateBack: true,
      lastForwardAxisRef,
    });
    expect(k).toBe("store-apply-back");
    expect(lastForwardAxisRef.current).toBe(null);
  });

  it("mypage to profile edit uses profile-edit-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind(
      "/mypage",
      "/mypage/section/account/profile/edit",
      { popstateBack: false, lastForwardAxisRef },
    );
    expect(k).toBe("profile-edit-forward");
    expect(lastForwardAxisRef.current).toBe("rtl");
  });

  it("profile edit back to mypage uses profile-edit-back", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind(
      "/mypage/section/account/profile/edit",
      "/mypage",
      { popstateBack: true, lastForwardAxisRef },
    );
    expect(k).toBe("profile-edit-back");
  });

  it("profile edit to mypage subsection keeps subtle (not profile-edit-back)", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind(
      "/mypage/section/account/profile/edit",
      "/mypage/section/trade/sales",
      { popstateBack: false, lastForwardAxisRef },
    );
    expect(k).toBe("subtle");
  });
});

describe("computeRouteTransitionEnterKind with dynamic resolver", () => {
  /**
   * admin 이 `[stores, community, home, chat, my]` 순서로 저장한 경우의 슬라이드 방향.
   * - /stores → /philife : ixPrev=0, ixNext=1 → rtl-forward (우측 메뉴 선택, 우→좌)
   * - /philife → /stores : ixPrev=1, ixNext=0 → ltr-forward (좌측 메뉴 선택, 좌→우)
   */
  const adminReorderedTabs: BottomNavItemConfig[] = [
    { id: "stores", href: "/stores", label: "배달", icon: "stores" },
    { id: "community", href: "/philife", label: "커뮤니티", icon: "community" },
    { id: "home", href: "/market", label: "거래", icon: "trade" },
    { id: "chat", href: "/community-messenger?section=chats", label: "메신저", icon: "chat" },
    { id: "my", href: "/mypage", label: "내정보", icon: "my" },
  ];
  const resolveIndex = buildCanonicalNavIndexResolver(adminReorderedTabs);

  it("respects admin order — stores→philife is forward to right (rtl-forward)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores", "/philife", {
      popstateBack: false,
      lastForwardAxisRef,
      resolveIndex,
    });
    expect(k).toBe("rtl-forward");
  });

  it("respects admin order — philife→stores is forward to left (ltr-forward)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/philife", "/stores", {
      popstateBack: false,
      lastForwardAxisRef,
      resolveIndex,
    });
    expect(k).toBe("ltr-forward");
  });

  it("dynamic resolver — sub-route (/post/abc) maps to home tab in admin order", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    /** /stores(0) → /post/abc(home=2) → ixNext > ixPrev → rtl-forward */
    const k = computeRouteTransitionEnterKind("/stores", "/post/abc", {
      popstateBack: false,
      lastForwardAxisRef,
      resolveIndex,
    });
    expect(k).toBe("rtl-forward");
  });
});
