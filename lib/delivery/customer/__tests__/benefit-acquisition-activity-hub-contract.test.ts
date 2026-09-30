import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMypageHomeStoreOwnerEntry } from "@/lib/mypage/mypage-home-menu-config";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { COMMERCE_HUB_TABS } from "@/lib/delivery/customer/commerce-hub-nav";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("delivery benefit acquisition boundary + activity hub", () => {
  it("store detail has no gift purchase or coupon claim strips", () => {
    const summary = source("components/stores/store-detail/StoreDetailSummarySection.tsx");
    expect(summary).not.toContain("StoreDetailGiftStrip");
    expect(summary).not.toContain("StoreDetailCouponClaimStrip");
    expect(summary).not.toContain("gift-certificates/mall");
    expect(summary).not.toContain("store-coupons/claimable");
  });

  it("cart apply surfaces remain reachable", () => {
    const gift = source("components/stores/cart/StoreCartGiftApplyPanel.tsx");
    const coupon = source("components/stores/cart/StoreCartCouponApplyPanel.tsx");
    expect(gift).toContain("export function StoreCartGiftApplyPanel");
    expect(coupon).toContain("export function StoreCartCouponApplyPanel");
  });

  it("activity hub has one primary IA without overview cards", () => {
    const body = source("components/orders/customer-commerce/CustomerCommerceHubBody.tsx");
    const tabs = source("components/orders/customer-commerce/CustomerCommerceHubPrimaryTabs.tsx");
    expect(body).not.toContain("CustomerCommerceHubOverview");
    expect(body).toContain('data-commerce-hub-overview="0"');
    expect(body).not.toContain("CommerceHubSellerTransitionSection");
    expect(tabs).toContain("orders");
    expect(tabs).toContain("coupons");
    expect(tabs).toContain("gifts");
    expect(tabs).toContain("CommerceHubStoreOwnerEntryCta");
  });

  it("Option B visual: 3 equal tabs + independent store action (not 4th tab cell)", () => {
    const tabs = source("components/orders/customer-commerce/CustomerCommerceHubPrimaryTabs.tsx");
    const body = source("components/orders/customer-commerce/CustomerCommerceHubBody.tsx");
    const cta = source("components/orders/customer-commerce/CommerceHubStoreOwnerEntryCta.tsx");
    const nav = source("lib/delivery/customer/commerce-hub-nav.ts");

    expect(COMMERCE_HUB_TABS).toEqual(["orders", "coupons", "gifts"]);
    expect(COMMERCE_HUB_TABS).toHaveLength(3);
    expect(nav).not.toMatch(/["']store["']/);
    expect(tabs).not.toMatch(/tab=store|CommerceHubTab.*store/);
    expect(tabs).toContain('data-commerce-hub-tablist="1"');
    expect(tabs).toContain("data-commerce-hub-tab={id}");
    expect(tabs).toContain("grid-cols-3");
    expect(tabs).toContain('data-commerce-hub-owner-action-row="1"');
    expect(tabs).toContain("CommerceHubStoreOwnerEntryCta");
    // CTA must not share tab flex/width geometry (4th-tab FAIL pattern)
    expect(tabs).not.toMatch(/flex min-w-0 items-stretch/);
    expect(tabs).not.toMatch(/border-l border-sam-border/);
    expect(body).not.toContain("CommerceHubSellerTransitionSection");
    expect(body).not.toContain("data-commerce-hub-seller-section");
    expect(cta).toContain("resolveMypageHomeStoreOwnerEntry");
    expect(cta).toContain('data-commerce-hub-owner-cta="1"');
    expect(cta).toContain("ChevronRight");
    expect(cta).not.toMatch(/role=["']tab["']/);
    expect(cta).not.toMatch(/self-stretch/);
    expect(cta).not.toMatch(/border-l/);
    expect(cta).not.toMatch(/function resolveActivityStoreEntry/);
    expect(cta).not.toMatch(/if\s*\(\s*(storeId|firstId|sid)\s*\)/);
  });

  it("structural IA: tablist owns only content tabs; store CTA is sibling action row", () => {
    const tabs = source("components/orders/customer-commerce/CustomerCommerceHubPrimaryTabs.tsx");
    const tablistStart = tabs.indexOf('role="tablist"');
    const actionRowStart = tabs.indexOf('data-commerce-hub-owner-action-row="1"');
    expect(tablistStart).toBeGreaterThan(-1);
    expect(actionRowStart).toBeGreaterThan(tablistStart);
    const tablistChunk = tabs.slice(tablistStart, actionRowStart);
    expect(tablistChunk).toContain("COMMERCE_HUB_TABS.map");
    expect(tablistChunk).not.toContain("CommerceHubStoreOwnerEntryCta");
    expect(tabs.slice(actionRowStart)).toContain("CommerceHubStoreOwnerEntryCta");
  });

  it("gift purchase CTA remains on gifts wallet only among activity/store detail", () => {
    const wallet = source("components/orders/customer-commerce/CustomerGiftWalletBody.tsx");
    const summary = source("components/stores/store-detail/StoreDetailSummarySection.tsx");
    expect(wallet).toContain("data-gift-wallet-buy-cta");
    expect(wallet).not.toContain("data-gift-wallet-owned-cta");
    expect(summary).not.toContain("data-store-gift");
  });

  it("top owner CTA reuses MyPage owner resolver (no shadow resolver)", () => {
    const cta = source("components/orders/customer-commerce/CommerceHubStoreOwnerEntryCta.tsx");
    expect(cta).toContain("resolveMypageHomeStoreOwnerEntry");
    expect(cta).toContain("getOwnerStoreGateState");
    expect(cta).not.toMatch(/function resolveActivityStoreEntry/);
  });

  it("canonical store entry destinations match MyPage resolver", () => {
    expect(resolveMypageHomeStoreOwnerEntry(null).href).toBe(OwnerRoutes.apply());
    expect(resolveMypageHomeStoreOwnerEntry({ kind: "empty" }).href).toBe(OwnerRoutes.apply());
    expect(resolveMypageHomeStoreOwnerEntry({ kind: "approved" }, "s1").href).toBe(
      OwnerRoutes.hub("s1")
    );
    expect(
      resolveMypageHomeStoreOwnerEntry({
        kind: "pending",
        approval_status: "pending",
        rejected_reason: null,
        revision_note: null,
      }).href
    ).toBe(OwnerRoutes.hub());
  });

  it("PENDING + existing storeId must never enter hub?storeId or apply", () => {
    const pendingStoreId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const gate = getOwnerStoreGateState([{ id: pendingStoreId, approval_status: "pending" }]);
    expect(gate.kind).toBe("pending");
    const entry = resolveMypageHomeStoreOwnerEntry(gate, pendingStoreId);
    expect(entry.titleKey).toBe("mypage_comp_menu_store_approval_progress_title");
    expect(entry.href).toBe(OwnerRoutes.hub());
    expect(entry.href).toBe("/stores/owner");
    expect(entry.href.includes("storeId=")).toBe(false);
    expect(entry.href.includes("/apply")).toBe(false);
    expect(entry.href).not.toBe(OwnerRoutes.hub(pendingStoreId));
    expect(entry.href).not.toBe(OwnerRoutes.apply());
  });
});
