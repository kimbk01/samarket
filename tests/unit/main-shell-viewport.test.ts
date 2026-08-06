import { describe, expect, it } from "vitest";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import {
  APP_SHELL_FILL_VIEWPORT_CLASS,
  MAIN_COLUMN_SCROLL_CLASS,
  MAIN_SHELL_VIEWPORT_LOCK_CLASS,
  buildMainShellInnerRootClass,
  resolvesMainScrollInMainColumn,
} from "@/lib/layout/main-shell-viewport";

describe("main-shell-viewport", () => {
  it("locks viewport height on main shell root", () => {
    expect(MAIN_SHELL_VIEWPORT_LOCK_CLASS).toMatch(/100dvh/);
    expect(MAIN_SHELL_VIEWPORT_LOCK_CLASS).toMatch(/overflow-hidden/);
  });

  it("enables main column scroll for hub surfaces", () => {
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: false,
        isStoreOwnerAdminRoute: false,
        isMainColumnViewportLocked: false,
      })
    ).toBe(true);
  });

  it("disables main column scroll for chat·owner·cart lock", () => {
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: true,
        isStoreOwnerAdminRoute: false,
        isMainColumnViewportLocked: false,
      })
    ).toBe(false);
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: false,
        isStoreOwnerAdminRoute: true,
        isMainColumnViewportLocked: false,
      })
    ).toBe(false);
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: false,
        isStoreOwnerAdminRoute: false,
        isMainColumnViewportLocked: true,
      })
    ).toBe(false);
  });

  it("main scroll class includes overflow-y-auto", () => {
    expect(MAIN_COLUMN_SCROLL_CLASS).toMatch(/overflow-y-auto/);
    expect(APP_SHELL_FILL_VIEWPORT_CLASS).toMatch(/overflow-hidden/);
  });

  it("inner root for hub scroll avoids min-h-[100dvh]", () => {
    const cls = buildMainShellInnerRootClass();
    expect(cls).toMatch(/min-h-0/);
    expect(cls).toMatch(/flex-1/);
    expect(cls).not.toMatch(/100dvh/);
    expect(buildMainShellInnerRootClass({ heroMenuSurface: true })).not.toMatch(/bg-sam-app/);
  });
});

describe("stores hub scroll contract", () => {
  it("/stores uses main column scroll with tier1 in layout", () => {
    const f = resolveConditionalAppShellFlags("/stores", true);
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: f.isChatRoomDetail,
        isStoreOwnerAdminRoute: f.isStoreOwnerAdminRoute,
        isMainColumnViewportLocked: f.isMainColumnViewportLocked,
      })
    ).toBe(true);
    expect(f.showRegionBar).toBe(false);
    expect(f.isChatRoomDetail).toBe(false);
  });
});

describe("stores owner apply scroll contract", () => {
  it("/stores/owner/apply locks main scroll and hides global tier1", () => {
    const f = resolveConditionalAppShellFlags("/stores/owner/apply", true);
    expect(f.isStoreOwnerAdminRoute).toBe(true);
    expect(
      resolvesMainScrollInMainColumn({
        isChatRoomDetail: f.isChatRoomDetail,
        isStoreOwnerAdminRoute: f.isStoreOwnerAdminRoute,
        isMainColumnViewportLocked: f.isMainColumnViewportLocked,
      })
    ).toBe(false);
    expect(f.hideRegionBar).toBe(true);
  });
});

describe("orders hub store review tier1", () => {
  it("/orders/store/:id/review uses review title and back to order detail", () => {
    const orderId = "267ca6b7-bbc4-415c-83df-da3c37808613";
    const f = resolveMainTier1Subpage(`/orders/store/${orderId}/review`);
    expect(f?.titleText).toBe("tier1_review_write");
    expect(f?.subtitle).toBe("tier1_review_write_subtitle");
    expect(f?.backHref).toBe(`/orders?expand=${encodeURIComponent(orderId)}`);
    expect(f?.showHubQuickActions).toBe(false);
  });
});

describe("orders hub store review shell", () => {
  it("/orders hides bottom nav and delivery FAB", () => {
    const f = resolveConditionalAppShellFlags("/orders", false);
    expect(f.showBottomNav).toBe(false);
    expect(f.showMainBottomNavFabSector).toBe(false);
    expect(f.mainBottomClass).toBe("pb-4");
  });

  it("/orders/store/:id hides bottom nav and delivery FAB", () => {
    const orderId = "267ca6b7-bbc4-415c-83df-da3c37808613";
    const f = resolveConditionalAppShellFlags(`/orders/store/${orderId}`, false);
    expect(f.showBottomNav).toBe(false);
    expect(f.showMainBottomNavFabSector).toBe(false);
    expect(f.mainBottomClass).toBe("pb-4");
  });

  it("/orders/store/:id/review hides bottom nav, FAB, and bottom padding", () => {
    const orderId = "267ca6b7-bbc4-415c-83df-da3c37808613";
    const f = resolveConditionalAppShellFlags(`/orders/store/${orderId}/review`, false);
    expect(f.showBottomNav).toBe(false);
    expect(f.showMainBottomNavFabSector).toBe(false);
    expect(f.mainBottomClass).toBe("pb-0");
    expect(f.isMainColumnViewportLocked).toBe(true);
  });
});

describe("platform legal public surfaces", () => {
  it.each(["/terms", "/privacy", "/business-info"])(
    "%s hides OwnerLite strip and global write FAB",
    (path) => {
      const f = resolveConditionalAppShellFlags(path, false);
      expect(f.showFloat).toBe(false);
      expect(f.showOwnerLiteStoreBar).toBe(false);
      expect(f.showMainBottomNavFabSector).toBe(false);
    },
  );
});

describe("desktop side nav eligibility", () => {
  it("/mypage hub enables desktop side nav eligibility with bottom nav", () => {
    const f = resolveConditionalAppShellFlags("/mypage", false);
    expect(f.showBottomNav).toBe(true);
    expect(f.showMainDesktopSideNavEligible).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });

  it("/mypage/trade/chat room hides desktop side nav eligibility", () => {
    const f = resolveConditionalAppShellFlags("/mypage/trade/chat/room-1", false);
    expect(f.showBottomNav).toBe(false);
    expect(f.showMainDesktopSideNavEligible).toBe(false);
  });

  it("/mypage/addresses hides desktop side nav eligibility", () => {
    const f = resolveConditionalAppShellFlags("/mypage/addresses", false);
    expect(f.showBottomNav).toBe(false);
    expect(f.showMainDesktopSideNavEligible).toBe(false);
  });
});

describe("mypage address tier1 titles", () => {
  it("/mypage/addresses uses address_manage_title not dibaY fallback", () => {
    const f = resolveMainTier1Subpage("/mypage/addresses");
    expect(f?.titleText).toBe("address_manage_title");
    expect(f?.subtitle).toBeUndefined();
  });

  it("/mypage/addresses/edit uses addr_ui_add_title default", () => {
    const f = resolveMainTier1Subpage("/mypage/addresses/edit");
    expect(f?.titleText).toBe("addr_ui_add_title");
  });
});

describe("philife neighborhood post detail shell", () => {
  const postId = "0b4b9807-ca82-4bbd-aa97-012833581ba2";

  it("/philife/{uuid} keeps bottom nav with scroll padding", () => {
    const f = resolveConditionalAppShellFlags(`/philife/${postId}`, false);
    expect(f.isPhilifeNeighborhoodPostDetail).toBe(true);
    expect(f.showBottomNav).toBe(true);
    expect(f.mainBottomClass).not.toBe("pb-4");
  });

  it("/community/posts/{uuid} keeps bottom nav", () => {
    const f = resolveConditionalAppShellFlags(`/community/posts/${postId}`, false);
    expect(f.isPhilifeNeighborhoodPostDetail).toBe(true);
    expect(f.showBottomNav).toBe(true);
  });

  it("/philife feed keeps bottom nav", () => {
    const f = resolveConditionalAppShellFlags("/philife", false);
    expect(f.isPhilifeNeighborhoodPostDetail).toBe(false);
    expect(f.showBottomNav).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });
});

describe("main tab hub shell bottom padding", () => {
  it("/market hub uses body clearance shell pb-0", () => {
    const f = resolveConditionalAppShellFlags("/market", false);
    expect(f.mainBottomClass).toBe("pb-0");
  });

  it("/stores/browse uses body clearance shell pb-0", () => {
    const f = resolveConditionalAppShellFlags("/stores/browse/food", false);
    expect(f.showBottomNav).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });

  it("/stores/cart uses body clearance shell pb-0", () => {
    const f = resolveConditionalAppShellFlags("/stores/cart", false);
    expect(f.showBottomNav).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });

  it("/community-messenger room keeps shell pb-0 (chat viewport)", () => {
    const f = resolveConditionalAppShellFlags("/community-messenger/rooms/abc", false);
    expect(f.showBottomNav).toBe(false);
    expect(f.mainBottomClass).toBe("pb-0");
  });
});

describe("mypage address shell", () => {
  it("/mypage/addresses hides main bottom nav and locks main viewport", () => {
    const f = resolveConditionalAppShellFlags("/mypage/addresses", true);
    expect(f.showBottomNav).toBe(false);
    expect(f.isMainColumnViewportLocked).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });

  it("/mypage/addresses/edit hides main bottom nav and locks main viewport", () => {
    const f = resolveConditionalAppShellFlags("/mypage/addresses/edit", true);
    expect(f.isMypageAddressEditPage).toBe(true);
    expect(f.showBottomNav).toBe(false);
    expect(f.isMainColumnViewportLocked).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });
});
