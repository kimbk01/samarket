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

describe("mypage address edit shell", () => {
  it("/mypage/addresses/edit hides main bottom nav", () => {
    const f = resolveConditionalAppShellFlags("/mypage/addresses/edit", true);
    expect(f.isMypageAddressEditPage).toBe(true);
    expect(f.showBottomNav).toBe(false);
  });
});
