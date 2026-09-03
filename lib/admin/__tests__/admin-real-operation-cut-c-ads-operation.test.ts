import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_BELL_STORE_CHARGES_NOT_FOR_ADS_OR_CASH_QUEUE,
  ADS_DOMAIN_SEPARATION,
  CUT_B_PRODUCTION_CARRY,
  DELIVERY_AD_APPLICATION_EXECUTION_VERDICT,
  DELIVERY_AD_PAYMENT_NEVER_ACTIVATES,
  assertAdminRealOperationCutCAdsOperationHardLock,
} from "@/lib/admin/admin-real-operation-cut-c-ads-operation-hard-lock";
import { DELIVERY_AD_APPLICATION_ID_EQUALS_EXECUTION_ID } from "@/lib/admin/admin-real-operation-cut-a-authority-hard-lock";
import { ownerActionTargetLifecycle } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { deliveryAdPolicyScreenHref } from "@/lib/stores/advertising/delivery-ad-placement-language";
import { evaluateStoreSponsoredCampaignGates } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import { mapAdminDeliveryAdActionQueuePresentation } from "@/lib/stores/advertising/delivery-ad-admin-action-queue-presentation";
import { getAdminDeliveryAdRequiredDecisionPresentation } from "@/lib/stores/advertising/delivery-ad-admin-required-decision";
import { R3_ADMIN_PARTNER_NOT_PRODUCT } from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { DELIVERY_AD_PRODUCT_KEYS } from "@/lib/stores/advertising/delivery-ad-product-registry";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("CUT C Ads operation close", () => {
  it("locks anchors + CUT B production carry", () => {
    expect(assertAdminRealOperationCutCAdsOperationHardLock()).toBe(true);
    expect(DELIVERY_AD_APPLICATION_EXECUTION_VERDICT).toBe("KEEP_CURRENT");
    expect(DELIVERY_AD_APPLICATION_ID_EQUALS_EXECUTION_ID).toBe(true);
    expect(DELIVERY_AD_PAYMENT_NEVER_ACTIVATES).toBe(true);
    expect(ADMIN_BELL_STORE_CHARGES_NOT_FOR_ADS_OR_CASH_QUEUE).toBe(true);
    expect(CUT_B_PRODUCTION_CARRY.financeProductionE2E).toBe("NOT_PROVEN");
    expect(CUT_B_PRODUCTION_CARRY.coinProductionEarn).toBe("NOT_PROVEN");
    expect(CUT_B_PRODUCTION_CARRY.saleRecognitionEnv).toBe("NOT_PROVEN");
  });

  it("A1/A11 — Owner submit → SUBMITTED; payment never ACTIVE", () => {
    expect(ownerActionTargetLifecycle("submit")).toBe("SUBMITTED");
    expect(ownerActionTargetLifecycle("submit")).not.toBe("ACTIVE");
    const actions = read("app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts");
    expect(actions).toContain("secureBusinessCashBeforeSubmit");
    expect(actions).toContain("debitBusinessCashForDeliveryAd");
  });

  it("A2/A10 — Delivery billing is Cash-only (no Point/Coin spend path)", () => {
    const actions = read("app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts");
    expect(actions).not.toMatch(/spendUserPoints|debitCoin|store_economic_point.*spend/);
    expect(actions).toContain("debitBusinessCashForDeliveryAd");
  });

  it("A3/A15 — Admin CTA consumes canonical presentation", () => {
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    const queue = read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");
    expect(detail).toContain("getAdminDeliveryAdRequiredDecisionPresentation");
    expect(queue).toContain("mapAdminDeliveryAdActionQueuePresentation");
    const rd = getAdminDeliveryAdRequiredDecisionPresentation("UNDER_REVIEW");
    expect(rd.decisionRequired).toBe(true);
    expect(rd.primaryReviewActions).toContain("approve");
    const aq = mapAdminDeliveryAdActionQueuePresentation({
      productKind: "store_sponsored",
      lifecycleStatus: "SUBMITTED",
    });
    expect(aq.cta).toBe("review");
  });

  it("A4/A5 — eligibility requires ACTIVE; PAUSED_ADMIN fails", () => {
    const base = {
      id: "c1",
      storeId: "s1",
      placement: "stores_home" as const,
      title: "t",
      headline: "h",
      bodyCopy: null,
      imageUrl: null,
      startAt: "2020-01-01T00:00:00.000Z",
      endAt: "2099-01-01T00:00:00.000Z",
      isActive: true,
      reviewStatus: "APPROVED" as const,
      inventoryKeys: ["STORES_HOME_FEED" as const],
      campaignSource: "OWNER_PAID",
      fundingStatus: "FUNDED" as const,
    };
    const nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const active = evaluateStoreSponsoredCampaignGates({
      campaign: { ...base, lifecycleStatus: "ACTIVE" },
      surface: "STORES_HOME_FEED",
      nowMs,
    });
    expect(active.ok).toBe(true);
    const paused = evaluateStoreSponsoredCampaignGates({
      campaign: { ...base, lifecycleStatus: "PAUSED_ADMIN", isActive: false },
      surface: "STORES_HOME_FEED",
      nowMs,
    });
    expect(paused.ok).toBe(false);
    expect(paused.reasons).toContain("campaign_ACTIVE");
  });

  it("A8/A9 — placement preview + CROSS_LINK config; SEARCH_TOP inventory link", () => {
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toContain("DeliveryAdCampaignPlacementPreviews");
    expect(deliveryAdPolicyScreenHref("STORES_HOME_FEED")).toBe("/admin/stores-home-shelves");
    expect(deliveryAdPolicyScreenHref("STORES_CATEGORY_FEED")).toBe(
      "/admin/stores-category-policy"
    );
    expect(deliveryAdPolicyScreenHref("STORES_SEARCH_TOP")).toBe(
      "/admin/delivery-ads/inventory"
    );
    expect(ADS_DOMAIN_SEPARATION.homeCategoryAdsMayWriteComposition).toBe(false);
  });

  it("A12 — legacy writers remain 410", () => {
    expect(read("app/api/admin/store-paid-ads/route.ts")).toContain("410");
    expect(read("app/api/admin/store-banner-ads/route.ts")).toContain("410");
  });

  it("A13/A14 — Feed and Popup remain separate; Partner not product", () => {
    expect(ADS_DOMAIN_SEPARATION.deliverySharedWithFeed).toBe(false);
    expect(ADS_DOMAIN_SEPARATION.deliverySharedWithPopup).toBe(false);
    expect(R3_ADMIN_PARTNER_NOT_PRODUCT).toBe(true);
    expect([...DELIVERY_AD_PRODUCT_KEYS]).not.toContain("partner");
    expect(read("lib/ads/feed-ad-request-point-flow.ts")).toMatch(/point|Point|HOLD|CAPTURE/);
    expect(read("lib/platform-popup/owner-request-writer.ts")).toContain(
      "debitBusinessCashForDeliveryAd"
    );
  });

  it("Finance context on Ads detail + bell boundary", () => {
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toContain("data-admin-delivery-ads-finance-link");
    expect(detail).toContain("data-admin-delivery-ads-cash-queue-link");
    const hub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(hub).not.toMatch(/admin-bell[\s\S]{0,80}store_charges/);
    expect(read("components/admin/finance/AdminFinanceOpsQueue.tsx")).toContain(
      "/api/admin/business-cash-charges"
    );
    expect(read("lib/admin/admin-action-queue.ts")).toContain("store_point_charge_requests");
  });
});
