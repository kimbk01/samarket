import { describe, expect, it, vi } from "vitest";
import {
  isMypageMotionKind,
  isMypageStackHeaderFixedKind,
  ownerStackRouteTransitionClassForKind,
  resolveCanonicalNavIndex,
  routeTransitionClassForKind,
  routeTransitionExitClassForKind,
  routeTransitionPushAxisForKind,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";
import { mypageStackDepth } from "@/lib/mypage/mypage-stack-slide";
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

  it("same pillar list surfaces use subtle", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/market", "/market/foo", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("subtle");
  });

  it("PAGE NAV SSOT: messenger hub ↔ trade/delivery pillar suppresses AppRouteTransition", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      computeRouteTransitionEnterKind("/community-messenger", "/community-messenger/trade-chats", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("none");
    expect(
      computeRouteTransitionEnterKind("/community-messenger/trade-chats", "/community-messenger", {
        popstateBack: true,
        lastForwardAxisRef,
      })
    ).toBe("none");
    expect(
      computeRouteTransitionEnterKind("/community-messenger", "/community-messenger/delivery-chats", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("none");
    expect(
      computeRouteTransitionEnterKind(
        "/community-messenger/trade-chats",
        "/community-messenger/rooms/abc",
        { popstateBack: false, lastForwardAxisRef }
      )
    ).toBe("none");
  });

  it("PAGE NAV SSOT: market → messenger hub keeps main-shell (not messenger-internal)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      computeRouteTransitionEnterKind("/market", "/community-messenger", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("rtl-forward");
  });

  it("ARCH B2: browse ↔ store detail uses subtle (shell owns slide)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      computeRouteTransitionEnterKind("/stores/browse/restaurant", "/stores/aa11", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("subtle");
    expect(
      computeRouteTransitionEnterKind("/stores/aa11", "/stores/browse/restaurant", {
        popstateBack: true,
        lastForwardAxisRef,
      })
    ).toBe("subtle");
  });

  it("SINGLE-ACTION: hub ↔ store detail uses subtle (StoreDetailSlideShell owns slide)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      computeRouteTransitionEnterKind("/stores", "/stores/aa11", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("subtle");
    expect(
      computeRouteTransitionEnterKind("/stores/aa11", "/stores", {
        popstateBack: true,
        lastForwardAxisRef,
      })
    ).toBe("subtle");
  });

  it("hub ↔ hub cart keeps rtl/ltr (not store-detail shell pair)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      computeRouteTransitionEnterKind("/stores", "/stores/cart", {
        popstateBack: false,
        lastForwardAxisRef,
      })
    ).toBe("rtl-forward");
    expect(
      computeRouteTransitionEnterKind("/stores/cart", "/stores", {
        popstateBack: true,
        lastForwardAxisRef,
      })
    ).toBe("ltr-back");
  });

  it("market list to trade post detail uses none (no shell slide; morph engine removed)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/market", "/post/abc-1", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("none");
    expect(routeTransitionClassForKind(k)).toBeNull();
    expect(routeTransitionPushAxisForKind(k)).toBeNull();
  });

  it("trade post detail back to market list uses none (no shell slide)", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/post/abc-1", "/market", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("none");
  });

  it("mypage products list to trade post detail uses none not seller-hub ltr-back", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/mypage/products", "/post/abc-1", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("none");
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

  it("mypage to store owner hub uses store-enter-forward (bottom-up 440ms)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/mypage", "/stores/owner", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("store-enter-forward");
    expect(lastForwardAxisRef.current).toBe(null);
  });

  it("store owner hub back to mypage uses store-enter-back", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores/owner", "/mypage", {
      popstateBack: true,
      lastForwardAxisRef,
    });
    expect(k).toBe("store-enter-back");
    expect(lastForwardAxisRef.current).toBe(null);
  });

  it("mypage to store owner apply still uses store-apply-forward (not store-enter)", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/mypage", "/stores/owner/apply", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("store-apply-forward");
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

  it("profile edit to mypage subsection uses mypage-stack-back (depth 2 → 1; was subtle before R3/X2)", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind(
      "/mypage/section/account/profile/edit",
      "/mypage/section/trade/sales",
      { popstateBack: false, lastForwardAxisRef },
    );
    expect(k).toBe("mypage-stack-back");
  });

  it("any screen to address book uses address-platform-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/stores", "/mypage/addresses", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("address-platform-forward");
    expect(lastForwardAxisRef.current).toBe("rtl");
    expect(routeTransitionPushAxisForKind(k)).toBe("rtl");
    expect(routeTransitionClassForKind(k)).toBe("address-platform-route-enter-forward");
  });

  it("mypage to address book uses address-platform-forward not subtle", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/mypage", "/mypage/addresses", {
      popstateBack: false,
      lastForwardAxisRef,
    });
    expect(k).toBe("address-platform-forward");
  });

  it("address book to search to detail uses address-platform-forward", () => {
    const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
    expect(
      computeRouteTransitionEnterKind("/mypage/addresses", "/mypage/addresses/search", {
        popstateBack: false,
        lastForwardAxisRef,
      }),
    ).toBe("address-platform-forward");
    expect(
      computeRouteTransitionEnterKind("/mypage/addresses/search", "/mypage/addresses/edit", {
        popstateBack: false,
        lastForwardAxisRef,
      }),
    ).toBe("address-platform-forward");
  });

  it("address detail back to origin uses address-platform-back", () => {
    const lastForwardAxisRef = { current: "rtl" as "ltr" | "rtl" | null };
    const k = computeRouteTransitionEnterKind("/mypage/addresses/edit", "/stores", {
      popstateBack: true,
      lastForwardAxisRef,
    });
    expect(k).toBe("address-platform-back");
    expect(routeTransitionClassForKind(k)).toBe("address-platform-route-enter-back");
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

describe("R3 / X2 — mypage stack 300ms kinds", () => {
  type Axis = "ltr" | "rtl" | null;
  const run = (prev: string, next: string, popstateBack = false, axis: Axis = null) => {
    const lastForwardAxisRef = { current: axis };
    const kind = computeRouteTransitionEnterKind(prev, next, { popstateBack, lastForwardAxisRef });
    return { kind, axis: lastForwardAxisRef.current };
  };

  it("mypageStackDepth: hub 0, section/<group>/<item> counts as 1", () => {
    expect(mypageStackDepth("/mypage")).toBe(0);
    expect(mypageStackDepth("/my")).toBe(0);
    expect(mypageStackDepth("/mypage/")).toBe(0);
    expect(mypageStackDepth("/mypage/offers")).toBe(1);
    expect(mypageStackDepth("/mypage/section/settings/notifications")).toBe(1);
    expect(mypageStackDepth("/mypage/store-orders/abc")).toBe(2);
    expect(mypageStackDepth("/mypage/store-orders/abc/review")).toBe(3);
    expect(mypageStackDepth("/mypage/points/charge")).toBe(2);
    expect(mypageStackDepth("/my/settings")).toBe(1);
    expect(mypageStackDepth("/market")).toBe(-1);
    expect(mypageStackDepth("/mypages")).toBe(-1);
  });

  it("hub → subpage push = mypage-stack-forward (rtl axis, 300ms class)", () => {
    const r = run("/mypage", "/mypage/offers");
    expect(r.kind).toBe("mypage-stack-forward");
    expect(r.axis).toBe("rtl");
    expect(routeTransitionPushAxisForKind(r.kind)).toBe("rtl");
    expect(routeTransitionClassForKind(r.kind)).toBe("mypage-stack-route-enter-forward");
    expect(routeTransitionExitClassForKind(r.kind)).toBeNull();
    expect(ownerStackRouteTransitionClassForKind(r.kind)).toBeNull();
    expect(isMypageMotionKind(r.kind)).toBe(true);
  });

  it("subpage → hub popstate = mypage-stack-back (ltr axis)", () => {
    const r = run("/mypage/offers", "/mypage", true, "rtl");
    expect(r.kind).toBe("mypage-stack-back");
    expect(r.axis).toBeNull();
    expect(routeTransitionPushAxisForKind(r.kind)).toBe("ltr");
    expect(routeTransitionClassForKind(r.kind)).toBe("mypage-stack-route-enter-back");
  });

  it("header back (push to shallower path) = mypage-stack-back", () => {
    expect(run("/mypage/store-orders/abc", "/mypage/store-orders").kind).toBe("mypage-stack-back");
  });

  it("list → detail forward, same depth forward, popstate same depth back", () => {
    expect(run("/mypage/store-orders", "/mypage/store-orders/x").kind).toBe("mypage-stack-forward");
    expect(run("/mypage/offers", "/mypage/reviews").kind).toBe("mypage-stack-forward");
    expect(run("/mypage/reviews", "/mypage/offers", true).kind).toBe("mypage-stack-back");
    expect(run("/mypage/store-orders/x", "/mypage/store-orders/x/review").kind).toBe("mypage-stack-forward");
  });

  it("/my alias and /mypage/section/* subtrees use mypage stack kinds", () => {
    expect(run("/my", "/my/settings").kind).toBe("mypage-stack-forward");
    expect(run("/mypage", "/mypage/section/store").kind).toBe("mypage-stack-forward");
    expect(run("/mypage/section/store", "/mypage", true).kind).toBe("mypage-stack-back");
    expect(run("/mypage/section/settings/notifications", "/mypage/section/settings/language").kind).toBe(
      "mypage-stack-forward"
    );
  });

  it("query-only change (?tab=) keeps none — pathname identical", () => {
    // usePathname 은 쿼리를 포함하지 않음 → prev === next
    expect(run("/mypage/offers", "/mypage/offers").kind).toBe("none");
  });

  it("profile-edit / address-platform kinds unchanged, now 300ms motion kinds", () => {
    expect(run("/mypage", "/mypage/section/account/profile/edit").kind).toBe("profile-edit-forward");
    expect(run("/mypage/section/account/profile/edit", "/mypage", true).kind).toBe("profile-edit-back");
    expect(run("/mypage", "/mypage/addresses").kind).toBe("address-platform-forward");
    expect(run("/mypage/addresses", "/mypage", true).kind).toBe("address-platform-back");
    for (const k of ["profile-edit-forward", "profile-edit-back", "address-platform-forward", "address-platform-back"] as const) {
      expect(isMypageMotionKind(k)).toBe(true);
    }
  });

  it("§4 ②: /mypage/products · points/promotions · gift-certificates/[id] use the mypage 300ms stack (mypage ↔ mypage)", () => {
    expect(run("/mypage", "/mypage/products").kind).toBe("mypage-stack-forward");
    expect(run("/mypage/products", "/mypage", true).kind).toBe("mypage-stack-back");
    expect(run("/mypage/products", "/mypage").kind).toBe("mypage-stack-back");
    expect(run("/mypage/products", "/mypage/points/promotions").kind).toBe("mypage-stack-forward");
    expect(run("/mypage/points/promotions", "/mypage/products", true).kind).toBe("mypage-stack-back");
    expect(run("/mypage", "/mypage/gift-certificates/abc").kind).toBe("mypage-stack-forward");
    expect(run("/mypage/gift-certificates/abc", "/mypage", true).kind).toBe("mypage-stack-back");
    for (const k of ["mypage-stack-forward", "mypage-stack-back"] as const) {
      expect(isMypageMotionKind(k)).toBe(true);
      expect(isMypageStackHeaderFixedKind(k)).toBe(true);
    }
  });

  it("§4 ②: pairs leaving mypage keep their domain kinds (seller hub · commerce wallet · trade detail)", () => {
    expect(run("/market/sell", "/mypage/products").kind).toBe("rtl-forward");
    expect(run("/mypage/products", "/market/sell", true).kind).toBe("ltr-back");
    expect(run("/mypage/products", "/post/abc-1").kind).toBe("none");
    expect(run("/mypage/gift-certificates", "/mypage/gift-certificates/abc").kind).toBe("rtl-forward");
    expect(run("/mypage/gift-certificates/abc", "/mypage/gift-certificates", true, "rtl").kind).toBe("ltr-back");
    expect(isMypageMotionKind("rtl-forward")).toBe(false);
    expect(isMypageMotionKind("ltr-back")).toBe(false);
  });

  it("§12 「전환 중」: header-fixed only for mypage stack kinds (other kinds slide header+body together)", () => {
    for (const k of [
      "rtl-forward",
      "ltr-back",
      "ltr-forward",
      "rtl-back",
      "subtle",
      "none",
      "profile-edit-forward",
      "profile-edit-back",
      "address-platform-forward",
      "address-platform-back",
    ] as const) {
      expect(isMypageStackHeaderFixedKind(k)).toBe(false);
    }
  });

  it("cross-domain pairs with mypage keep existing kinds", () => {
    expect(run("/mypage", "/stores/owner/apply").kind).toBe("store-apply-forward");
    expect(run("/stores/owner/apply", "/mypage", true).kind).toBe("store-apply-back");
    expect(run("/mypage", "/stores/owner").kind).toBe("store-enter-forward");
    expect(run("/stores/owner", "/mypage", true).kind).toBe("store-enter-back");
    expect(run("/market", "/mypage").kind).toBe("rtl-forward");
    expect(run("/mypage", "/philife").kind).toBe("ltr-forward");
    expect(run("/mypage/offers", "/market").kind).toBe("ltr-forward");
    expect(run("/community-messenger", "/mypage/offers").kind).toBe("rtl-forward");
  });

  it("other-domain route pairs — kinds unchanged (snapshot)", () => {
    const pairs: Array<[string, string, boolean, Axis]> = [
      ["/philife", "/market", false, null],
      ["/market", "/philife", false, null],
      ["/market", "/philife", true, "rtl"],
      ["/market", "/market/foo", false, null],
      ["/market", "/post/abc-1", false, null],
      ["/post/a", "/post/b", false, null],
      ["/stores", "/stores/aa11", false, null],
      ["/stores/browse/restaurant", "/stores/aa11", false, null],
      ["/stores", "/stores/cart", false, null],
      ["/stores/cart", "/stores", true, null],
      ["/orders/activity", "/stores/gift-mall", false, null],
      ["/stores/owner", "/stores/owner/orders", false, null],
      ["/stores/owner/orders", "/philife", false, null],
      ["/community-messenger", "/community-messenger/trade-chats", false, null],
      ["/community-messenger", "/community-messenger/rooms/abc", false, null],
      ["/market", "/community-messenger", false, null],
      ["/stores", "/mypage/addresses", false, null],
      ["/mypage/addresses/edit", "/stores", true, "rtl"],
      ["/mypage/gift-certificates", "/mypage/gift-certificates/abc", false, null],
      ["/mypage/gift-certificates/abc", "/mypage/gift-certificates", true, "rtl"],
    ];
    const out = pairs.map(([a, b, pop, axis]) => `${a} -> ${b}${pop ? " (pop)" : ""}: ${run(a, b, pop, axis).kind}`);
    expect(out).toEqual([
      "/philife -> /market: rtl-forward",
      "/market -> /philife: ltr-forward",
      "/market -> /philife (pop): ltr-back",
      "/market -> /market/foo: subtle",
      "/market -> /post/abc-1: none",
      "/post/a -> /post/b: rtl-forward",
      "/stores -> /stores/aa11: subtle",
      "/stores/browse/restaurant -> /stores/aa11: subtle",
      "/stores -> /stores/cart: rtl-forward",
      "/stores/cart -> /stores (pop): ltr-back",
      "/orders/activity -> /stores/gift-mall: rtl-forward",
      "/stores/owner -> /stores/owner/orders: none",
      "/stores/owner/orders -> /philife: ltr-back",
      "/community-messenger -> /community-messenger/trade-chats: none",
      "/community-messenger -> /community-messenger/rooms/abc: none",
      "/market -> /community-messenger: rtl-forward",
      "/stores -> /mypage/addresses: address-platform-forward",
      "/mypage/addresses/edit -> /stores (pop): address-platform-back",
      "/mypage/gift-certificates -> /mypage/gift-certificates/abc: rtl-forward",
      "/mypage/gift-certificates/abc -> /mypage/gift-certificates (pop): ltr-back",
    ]);
    for (const [a, b, pop, axis] of pairs) {
      const k: RouteTransitionEnterKind = run(a, b, pop, axis).kind;
      if (!k.startsWith("address-platform")) expect(isMypageMotionKind(k)).toBe(false);
    }
  });
});
