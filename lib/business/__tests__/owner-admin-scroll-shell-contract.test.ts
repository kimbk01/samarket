import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isOwnerBasicInfoPath,
  isOwnerInquiriesPath,
  isOwnerStoreFormBottomNavHiddenPath,
  isOwnerStoreOrdersPath,
  isOwnerStoreProfilePath,
} from "@/lib/business/owner-basic-info-guard";
import {
  isOwnerStoreProductComposerPath,
  resolveOwnerStackScrollHostPath,
} from "@/lib/business/owner-stack-scroll-host-path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("owner admin scroll shell contract", () => {
  it("basic-info is a stack scroll host (same as hub/profile — not excluded)", () => {
    const path = "/stores/owner/basic-info";
    expect(isOwnerBasicInfoPath(path)).toBe(true);
    expect(resolveOwnerStackScrollHostPath(path)).toBe(true);
  });

  it("hub and profile remain scroll hosts", () => {
    expect(resolveOwnerStackScrollHostPath("/stores/owner")).toBe(true);
    expect(resolveOwnerStackScrollHostPath("/stores/owner/profile")).toBe(true);
  });

  it("product composer is excluded from shared scroll host (RECOVERED_GOOD ad7942 private scroll)", () => {
    expect(resolveOwnerStackScrollHostPath("/stores/owner/products/new")).toBe(false);
    expect(isOwnerStoreProductComposerPath("/stores/owner/products/new")).toBe(true);
  });

  it("StoreBusinessGuard ok shell uses flex min-h-0 (not min-h-screen)", () => {
    const guard = readRepo("components/business/StoreBusinessGuard.tsx");
    expect(guard).toContain("OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS");
    expect(guard).toMatch(
      /return\s*<div className=\{OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS\}>\{children\}<\/div>/
    );
    expect(guard).not.toMatch(
      /return\s*<div className="min-h-screen">\{children\}<\/div>/
    );
  });

  it("BusinessAdminShell does not exclude basic-info from scroll host path", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("resolveOwnerStackScrollHostPath");
    expect(shell).not.toMatch(
      /ownerStackScrollHostPath[\s\S]{0,120}!isOwnerBasicInfoRoute/
    );
  });

  it("basic-info and profile hide owner mobile bottom nav separately", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toMatch(/!isOwnerFormBottomNavHiddenRoute\s*\?/);
    expect(isOwnerBasicInfoPath("/stores/owner/basic-info")).toBe(true);
    expect(isOwnerStoreProfilePath("/stores/owner/profile")).toBe(true);
  });

  it("inquiries keeps owner mobile bottom nav (Customers primary continuity)", () => {
    expect(isOwnerInquiriesPath("/stores/owner/inquiries")).toBe(true);
    expect(isOwnerStoreFormBottomNavHiddenPath("/stores/owner/inquiries")).toBe(false);
  });

  it("customer-care keeps owner mobile bottom nav (P0 Customers tab)", () => {
    expect(isOwnerStoreFormBottomNavHiddenPath("/stores/owner/customer-care")).toBe(false);
    expect(isOwnerStoreFormBottomNavHiddenPath("/stores/owner/customer-care/customer-center")).toBe(
      false
    );
    expect(
      isOwnerStoreFormBottomNavHiddenPath("/stores/owner/customer-care/messages/tid-1")
    ).toBe(false);
    expect(
      isOwnerStoreFormBottomNavHiddenPath("/stores/owner/customer-care/inquiries/tid-1")
    ).toBe(false);
  });

  it("orders management keeps owner mobile bottom nav (P0 Orders tab)", () => {
    expect(isOwnerStoreOrdersPath("/stores/owner/orders")).toBe(true);
    expect(isOwnerStoreFormBottomNavHiddenPath("/stores/owner/orders")).toBe(false);
    expect(isOwnerStoreOrdersPath("/stores/owner/orders/")).toBe(true);
  });

  it("basic-info and profile keep save/cancel footer always visible", () => {
    for (const rel of [
      "components/business/OwnerStoreBasicInfoForm.tsx",
      "components/business/OwnerStoreProfileForm.tsx",
    ]) {
      const src = readRepo(rel);
      expect(src).toContain("owner-admin-footer-actions");
      expect(src).toContain("useOwnerAdminFormKeyboard");
      expect(src).toContain("formPadStyle");
      expect(src).toContain("data-form-keyboard-footer");
      expect(src).not.toContain("OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS");
      expect(src).not.toMatch(/\{isDirty\s*\?\s*\n?\s*<BodyPortal>/);
      expect(src).toMatch(/disabled=\{!isDirty \|\|/);
    }
  });

  it("owner admin footer actions use shared apply-style divide-x bar", () => {
    const shared = readRepo("lib/business/owner-admin-footer-actions.ts");
    expect(shared).toContain("OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS");
    expect(shared).toContain("OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS");
    expect(shared).toContain("divide-x divide-sam-border");
    expect(shared).toContain("bg-signature text-white");
    expect(shared).not.toMatch(/max-w-\[42rem\]/);
    expect(shared).toContain("OWNER_STORE_ADMIN_FOOTER_BAR_CLASS");
    expect(shared).toMatch(/OWNER_STORE_ADMIN_FOOTER_INNER_CLASS[\s\S]*min-w-0/);

    for (const rel of [
      "components/business/OwnerStoreProfileForm.tsx",
      "components/business/OwnerStoreBasicInfoForm.tsx",
      "components/business/BusinessApplyForm.tsx",
      "components/business/owner/OwnerMenuCategoriesClient.tsx",
      "components/business/owner/OwnerProductForm.tsx",
    ]) {
      const src = readRepo(rel);
      expect(src).toContain("owner-admin-footer-actions");
      expect(src).toContain("OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS");
      expect(src).not.toMatch(/Biz\.btnPrimary/);
    }
  });

  it("settlements page uses OwnerAdminPageScrollShell (compact scroll host)", () => {
    const src = readRepo("app/(main)/stores/owner/settlements/page.tsx");
    expect(src).toContain("OwnerAdminPageScrollShell");
    expect(src).toContain("OwnerStoreSettlementsView");
  });

  it("order-chats list scroll root uses compact shell __scroll (bottom-nav hide SSOT)", () => {
    const src = readRepo("components/business/owner/OwnerStoreOrderChatsView.tsx");
    expect(src).toContain("OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS");
    expect(src).toContain('data-owner-scroll-host="order-chats-list"');
    expect(src).not.toMatch(/<ul className="min-h-0 flex-1 overflow-y-auto/);
  });

  it("orders list scroll root uses compact shell __scroll (sticky chrome stays outside)", () => {
    const src = readRepo("components/business/owner/OwnerStoreOrdersMobileBody.tsx");
    expect(src).toContain("OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS");
    expect(src).toContain('data-owner-scroll-host="orders-list"');
  });

  it("legacy points page redirects to canonical Owner finance", () => {
    const src = readRepo("app/(main)/stores/owner/points/page.tsx");
    expect(src).toContain("redirect(OwnerRoutes.finance(storeId))");
    expect(src).not.toContain("OwnerStorePointsView");
  });

  it("owner form keyboard SSOT reuses Form viewport (no parallel authority)", () => {
    const hook = readRepo("lib/business/use-owner-admin-form-keyboard.ts");
    expect(hook).toContain("useFormKeyboardViewport");
    expect(hook).toContain("ownerAdminFormBodyPadStyle");
    expect(hook).toContain("ownerAdminFormFooterInsetStyle");
    expect(hook).not.toMatch(/useMobileKeyboardInset/);

    for (const rel of [
      "components/business/BusinessApplyForm.tsx",
      "components/business/OwnerStoreProfileForm.tsx",
      "components/business/OwnerStoreBasicInfoForm.tsx",
      "components/business/owner/OwnerMenuCategoriesClient.tsx",
    ]) {
      const src = readRepo(rel);
      expect(src).toContain("useOwnerAdminFormKeyboard");
      expect(src).toContain("data-form-keyboard-footer");
      expect(src).not.toMatch(/pb-\[var\(--safe-bottom\)\]/);
      expect(src).not.toContain("OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS");
    }
  });

  it("owner BottomSheet keyboard reuses Form viewport via contentPaddingBottomPx", () => {
    const hook = readRepo("lib/business/use-owner-admin-bottom-sheet-keyboard.ts");
    expect(hook).toContain("useFormKeyboardViewport");
    expect(hook).toContain("contentPaddingBottomPx");
    expect(hook).not.toMatch(/useMobileKeyboardInset/);
    expect(hook).not.toMatch(/addEventListener\(\s*["']resize["']/);

    for (const rel of [
      "components/business/owner/OwnerStoreBannersView.tsx",
      "components/business/owner/OwnerStoreNoticesView.tsx",
      "components/business/owner/OwnerOrderAcceptSheet.tsx",
      "components/business/owner/OwnerOrderRejectSheet.tsx",
    ]) {
      const src = readRepo(rel);
      expect(src).toContain("useOwnerAdminBottomSheetKeyboard");
      expect(src).toContain("contentPaddingBottomPx");
    }
  });

  it("menu-categories edit does not nest overflow-y under ScrollShell", () => {
    const src = readRepo("components/business/owner/OwnerMenuCategoriesClient.tsx");
    expect(src).not.toMatch(/overflow-y-auto overscroll-y-contain bg-sam-app/);
    expect(src).toContain("useOwnerAdminFormKeyboard");
  });

  it("ensure order-chat writer uses canonical owner route (no /my/business hop)", () => {
    const src = readRepo("lib/chats/surfaces/order-chat-surface.ts");
    expect(src).toContain("/stores/owner/order-chat/");
    expect(src).not.toContain("/my/business/store-order-chat/");
  });

  it("owner compact shell main offset includes fixed header border (SSOT)", () => {
    const css = readRepo("app/owner-compact-shell.css");
    expect(css).toContain("--owner-shell-header-border: 1px");
    expect(css).toMatch(
      /--owner-content-top:\s*calc\([\s\S]*--owner-shell-header-border/
    );
    expect(css).toMatch(/--owner-shell-main-pt:\s*var\(--owner-content-top\)/);
    expect(css).toMatch(/\.owner-compact-shell__header[\s\S]*overflow-y:\s*hidden/);
    expect(css).toMatch(/\.owner-compact-shell__header-inner[\s\S]*overflow:\s*hidden/);
  });

  it("owner hub dashboard uses OwnerAdminPageScrollShell scroll host", () => {
    const src = readRepo("components/stores/owner/dashboard/OwnerOperationsDashboard.tsx");
    expect(src).toContain("OwnerAdminPageScrollShell");
    expect(src).not.toMatch(/<main[\s\S]*OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS/);
  });

  it("SELECTIVE_SHELL_RESTORE: single .owner-stack-shell height root (no JIT 100dvh concat, no nest)", () => {
    const css = readRepo("app/owner-compact-shell.css");
    expect(css).toMatch(/body\[data-owner-compact-shell\]\s+\.owner-stack-shell/);
    expect(css).toMatch(/--owner-header-height:\s*3\.5rem/);
    expect(css).not.toMatch(/--owner-header-height:\s*var\(--sam-header-row-height/);

    const layout = readRepo("lib/business/owner-compact-shell-layout.ts");
    expect(layout).toContain('OWNER_STACK_SHELL_ROOT_CLASS = "owner-stack-shell"');

    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("OWNER_STACK_SHELL_ROOT_CLASS");
    expect(shell).toContain("ownerStackShellRootClassName");
    expect(shell).not.toMatch(/\$\{OWNER_COMPACT_SHELL_MAX_TW\}:h-\[100dvh\]/);
    expect(shell).not.toMatch(/\$\{OWNER_COMPACT_SHELL_MAX_TW\}:max-h-\[100dvh\]/);
    expect(shell).not.toMatch(
      /\{\.\.\.ownerStackShellRootProps\}[\s\S]{0,220}\{\.\.\.ownerStackShellRootProps\}/
    );
    expect(shell).toContain("max-[1024px]:overflow-hidden");
    expect(shell).not.toMatch(/\$\{OWNER_COMPACT_SHELL_MAX_TW\}:overflow-hidden/);
  });

  it("product composer hides owner mobile bottom nav (Register/Save CTA clearance)", () => {
    expect(isOwnerStoreFormBottomNavHiddenPath("/stores/owner/products/new")).toBe(true);
    expect(
      isOwnerStoreFormBottomNavHiddenPath("/stores/owner/products/abc/edit")
    ).toBe(true);
    expect(isOwnerStoreFormBottomNavHiddenPath("/stores/owner/products")).toBe(false);
  });

  it("product composer uses RECOVERED_GOOD private height (ad7942) — not shared dual-pad scroll", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("isOwnerStoreProductComposerRoute");
    expect(shell).toContain(
      "flex h-full min-h-0 max-w-6xl flex-1 flex-col overflow-hidden px-2 sm:px-2 pt-[calc(var(--safe-top)+3.5rem+0.75rem)]"
    );
    expect(shell).toContain('h-[100dvh] max-h-[100dvh] min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden');
  });

  it("OwnerProductForm owns scroll body height (RECOVERED_GOOD ad7942)", () => {
    const form = readRepo("components/business/owner/OwnerProductForm.tsx");
    expect(form).not.toContain("OwnerAdminPageScrollShell");
    expect(form).toContain('data-owner-product-form-scroll="1"');
    expect(form).toContain('data-owner-product-composer="1"');
    expect(form).toContain(
      "h-[calc(100dvh-(var(--safe-top)+3.5rem+0.75rem))]"
    );
    expect(form).toMatch(
      /data-owner-product-form-scroll="1"[\s\S]{0,120}min-h-0 flex-1 overflow-x-hidden overflow-y-auto/
    );
  });

  it("Owner customer lists single-flight share parsed JSON (Response body once)", () => {
    for (const rel of [
      "components/business/owner/OwnerStoreReviewsView.tsx",
      "components/business/owner/OwnerStoreInquiriesView.tsx",
      "components/business/owner/OwnerStoreOrderChatsView.tsx",
    ]) {
      const src = readRepo(rel);
      expect(src).toContain("runSingleFlight");
      // Ban sharing raw fetch Response across waiters (body readable once).
      expect(src).not.toMatch(
        /runSingleFlight\([^)]+,\s*\(\)\s*=>\s*\n?\s*fetch\(/
      );
      expect(src).toMatch(/runSingleFlight\([\s\S]{0,200}async\s*\(\)\s*=>/);
    }
    const reviews = readRepo("components/business/owner/OwnerStoreReviewsView.tsx");
    expect(reviews).toContain("storeIdQuery");
    expect(reviews).not.toMatch(/useCallback\([\s\S]{0,40}\[searchParams\]/);
  });
});
