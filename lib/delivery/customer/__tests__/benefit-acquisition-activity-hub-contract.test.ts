import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMypageHomeStoreOwnerEntry } from "@/lib/mypage/mypage-home-menu-config";
import { OwnerRoutes } from "@/lib/business/owner-routes";

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
    expect(body).toContain("CommerceHubSellerTransitionSection");
    expect(tabs).toContain("orders");
    expect(tabs).toContain("coupons");
    expect(tabs).toContain("gifts");
  });

  it("gift purchase CTA remains on gifts wallet only among activity/store detail", () => {
    const wallet = source("components/orders/customer-commerce/CustomerGiftWalletBody.tsx");
    const summary = source("components/stores/store-detail/StoreDetailSummarySection.tsx");
    expect(wallet).toContain("data-gift-wallet-buy-cta");
    expect(wallet).not.toContain("data-gift-wallet-owned-cta");
    expect(summary).not.toContain("data-store-gift");
  });

  it("seller section reuses MyPage owner resolver", () => {
    const seller = source(
      "components/orders/customer-commerce/CommerceHubSellerTransitionSection.tsx"
    );
    expect(seller).toContain("resolveMypageHomeStoreOwnerEntry");
    expect(seller).not.toMatch(/function resolveActivityStoreEntry/);
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
});
