import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXED_BOTTOM_BAR_FAB_GAP_PX,
  FIXED_BOTTOM_BAR_MARKER_CLASS,
  measureFixedBottomBarOccupiedPx,
  resolveFabBottomAboveFixedBarCss,
} from "@/lib/layout/fixed-bottom-bar-occupancy";
import {
  SUPPORT_FAB_SAFE_BOTTOM_CLASS,
  resolveSupportFabBottomPlacement,
} from "@/lib/support/support-fab-bottom-placement";
import {
  OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_DISABLED_TOKEN_CLASS,
  ownerStoreAdminFooterFixedClass,
} from "@/lib/business/owner-admin-footer-actions";
import { resolveBusinessApplySubmitBlockedReason } from "@/lib/business/business-apply-submit-gate";

const ROOT = process.cwd();
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("measureFixedBottomBarOccupiedPx", () => {
  it("takes the highest bar top from the viewport bottom", () => {
    expect(
      measureFixedBottomBarOccupiedPx(
        [
          { top: 800 - 66, height: 66 },
          { top: 800 - 66 - 60, height: 66 },
        ],
        800
      )
    ).toBe(126);
  });

  it("ignores hidden / off-screen bars and bad viewport", () => {
    expect(measureFixedBottomBarOccupiedPx([{ top: 700, height: 0 }], 800)).toBe(0);
    expect(measureFixedBottomBarOccupiedPx([{ top: 900, height: 60 }], 800)).toBe(0);
    expect(measureFixedBottomBarOccupiedPx([{ top: 700, height: 60 }], 0)).toBe(0);
    expect(measureFixedBottomBarOccupiedPx([], 800)).toBe(0);
  });
});

describe("resolveSupportFabBottomPlacement", () => {
  const base = { ownerClass: "bottom-[var(--owner-fab-bottom)]", bottomNavClass: "bottom-nav-fab" };

  it("keeps class-only placement without a fixed bar", () => {
    expect(resolveSupportFabBottomPlacement({ ...base, ownerShell: false, bottomNavClearance: false, fixedBarOccupiedPx: 0 })).toEqual({
      className: SUPPORT_FAB_SAFE_BOTTOM_CLASS,
    });
    expect(resolveSupportFabBottomPlacement({ ...base, ownerShell: false, bottomNavClearance: true, fixedBarOccupiedPx: 0 })).toEqual({
      className: "bottom-nav-fab",
    });
    expect(resolveSupportFabBottomPlacement({ ...base, ownerShell: true, bottomNavClearance: true, fixedBarOccupiedPx: 0 })).toEqual({
      className: base.ownerClass,
    });
  });

  it("moves above a fixed bottom bar (max of base and bar top + gap)", () => {
    const p = resolveSupportFabBottomPlacement({ ...base, ownerShell: false, bottomNavClearance: false, fixedBarOccupiedPx: 94 });
    expect(p.style?.bottom).toBe(`max(calc(var(--safe-bottom, 0px) + 16px), ${94 + FIXED_BOTTOM_BAR_FAB_GAP_PX}px)`);
    const nav = resolveSupportFabBottomPlacement({ ...base, ownerShell: false, bottomNavClearance: true, fixedBarOccupiedPx: 126 });
    expect(nav.style?.bottom).toContain("var(--app-bottom-nav-height, 60px)");
    expect(nav.style?.bottom).toContain("136px");
    const owner = resolveSupportFabBottomPlacement({ ...base, ownerShell: true, bottomNavClearance: false, fixedBarOccupiedPx: 60 });
    expect(owner.style?.bottom).toBe("max(var(--owner-fab-bottom), 70px)");
  });

  it("resolveFabBottomAboveFixedBarCss returns null without a bar", () => {
    expect(resolveFabBottomAboveFixedBarCss("0px", 0)).toBeNull();
  });
});

describe("fixed bottom bars carry the shared marker (FAB reads one registry, no per-page hacks)", () => {
  it("owner admin form footer (e.g. /stores/owner/apply)", () => {
    expect(OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS.split(" ")).toContain(FIXED_BOTTOM_BAR_MARKER_CLASS);
    expect(ownerStoreAdminFooterFixedClass()).toContain(FIXED_BOTTOM_BAR_MARKER_CLASS);
    expect(ownerStoreAdminFooterFixedClass({ aboveBottomNav: true })).toContain(FIXED_BOTTOM_BAR_MARKER_CLASS);
  });

  it("MyStickyCta and CS comment bar", () => {
    expect(src("components/mypage/ds/MyStickyCta.tsx")).toContain("FIXED_BOTTOM_BAR_MARKER_CLASS");
    expect(src("components/mypage/cs/CustomerCenterCommentsPanel.tsx")).toContain("FIXED_BOTTOM_BAR_MARKER_CLASS");
  });

  it("SupportFabHost reads the occupied height and the placement resolver", () => {
    const host = src("components/support/SupportFabHost.tsx");
    expect(host).toContain("useFixedBottomBarOccupiedPx(showFab)");
    expect(host).toContain("resolveSupportFabBottomPlacement");
    expect(host).toContain("style={placement.style}");
  });
});

describe("/stores/owner/apply disabled submit", () => {
  it("uses token grey (not opacity) and a 1-line reason", () => {
    expect(OWNER_STORE_ADMIN_FOOTER_PRIMARY_DISABLED_TOKEN_CLASS).toContain("disabled:opacity-100");
    expect(OWNER_STORE_ADMIN_FOOTER_PRIMARY_DISABLED_TOKEN_CLASS).toContain("--sam-primary-disabled");
    const form = src("components/business/BusinessApplyForm.tsx");
    expect(form).toContain("OWNER_STORE_ADMIN_FOOTER_PRIMARY_DISABLED_TOKEN_CLASS");
    expect(form).toContain('data-testid="business-apply-submit-blocked-reason"');
  });

  it("reason follows the existing submit gate order", () => {
    expect(resolveBusinessApplySubmitBlockedReason({ storeSlug: "", addressId: null, applicantName: "" })).toBe("store_id");
    expect(resolveBusinessApplySubmitBlockedReason({ storeSlug: "a-1", addressId: null, applicantName: " " })).toBe("name");
    expect(resolveBusinessApplySubmitBlockedReason({ storeSlug: "a-1", addressId: null, applicantName: "Kim" })).toBe("address");
    expect(resolveBusinessApplySubmitBlockedReason({ storeSlug: "a-1", addressId: "ad1", applicantName: "Kim" })).toBeNull();
  });
});
