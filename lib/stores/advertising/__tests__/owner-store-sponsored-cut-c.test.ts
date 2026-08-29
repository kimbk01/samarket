/**
 * CUT C — Owner Store Sponsored contract tests (C1–C18 domain subset).
 */
import { describe, expect, it } from "vitest";
import {
  canOwnerRequestLifecycleTransition,
  assertDeliveryAdLifecycleTransition,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { canPhysicallyDeleteDeliveryAdCampaign } from "@/lib/stores/advertising/delivery-ad-audit";
import {
  DELIVERY_AD_OWNER_PRICING_PRODUCT,
  isStoreEligibleForOwnerAdApplication,
  ownerActionTargetLifecycle,
  validateOwnerInventorySelection,
  validateOwnerStoreSponsoredSchedule,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("CUT C Owner Store Sponsored contracts", () => {
  it("C5 invalid dates rejected", () => {
    const past = validateOwnerStoreSponsoredSchedule({
      startAtIso: "2020-01-01T00:00:00.000Z",
      endAtIso: "2020-01-08T00:00:00.000Z",
      nowMs: Date.parse("2026-08-29T00:00:00.000Z"),
    });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error).toBe("start_in_past");

    const order = validateOwnerStoreSponsoredSchedule({
      startAtIso: "2026-09-10T00:00:00.000Z",
      endAtIso: "2026-09-01T00:00:00.000Z",
      nowMs: Date.parse("2026-08-29T00:00:00.000Z"),
    });
    expect(order.ok).toBe(false);
    if (!order.ok) expect(order.error).toBe("end_before_start");
  });

  it("C6 no inventory rejected", () => {
    expect(validateOwnerInventorySelection([]).ok).toBe(false);
    expect(validateOwnerInventorySelection(undefined).ok).toBe(false);
    const ok = validateOwnerInventorySelection(["STORES_HOME_FEED", "STORES_CATEGORY_FEED"]);
    expect(ok.ok).toBe(true);
  });

  it("C7/C8 submit uses owner transition only; cannot set APPROVED", () => {
    expect(canOwnerRequestLifecycleTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canOwnerRequestLifecycleTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canOwnerRequestLifecycleTransition("DRAFT", "UNDER_REVIEW")).toBe(false);
    expect(assertDeliveryAdLifecycleTransition("DRAFT", "APPROVED", "owner").ok).toBe(false);
    expect(ownerActionTargetLifecycle("submit")).toBe("SUBMITTED");
  });

  it("C9 CHANGES_REQUESTED can resubmit", () => {
    expect(canOwnerRequestLifecycleTransition("CHANGES_REQUESTED", "SUBMITTED")).toBe(true);
    expect(ownerActionTargetLifecycle("resubmit")).toBe("SUBMITTED");
  });

  it("C10/C11 pause and resume", () => {
    expect(canOwnerRequestLifecycleTransition("ACTIVE", "PAUSED_OWNER")).toBe(true);
    expect(canOwnerRequestLifecycleTransition("PAUSED_OWNER", "ACTIVE")).toBe(true);
  });

  it("C12 PAUSED_ADMIN cannot be resumed by Owner", () => {
    expect(canOwnerRequestLifecycleTransition("PAUSED_ADMIN", "ACTIVE")).toBe(false);
  });

  it("C13 Owner END", () => {
    expect(canOwnerRequestLifecycleTransition("ACTIVE", "ENDED")).toBe(true);
    expect(canOwnerRequestLifecycleTransition("PAUSED_OWNER", "ENDED")).toBe(true);
  });

  it("C14 physical delete only DRAFT + zero history", () => {
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "DRAFT",
        history: {
          hasImpression: false,
          hasClick: false,
          hasAttribution: false,
          hasBilling: false,
          hasFinancialHistory: false,
          hasAuditHistory: false,
        },
      })
    ).toBe(true);
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "SUBMITTED",
        history: {
          hasImpression: false,
          hasClick: false,
          hasAttribution: false,
          hasBilling: false,
          hasFinancialHistory: false,
          hasAuditHistory: false,
        },
      })
    ).toBe(false);
  });

  it("store eligibility: approved+visible only", () => {
    expect(
      isStoreEligibleForOwnerAdApplication({ approvalStatus: "approved", isVisible: true })
    ).toBe(true);
    expect(
      isStoreEligibleForOwnerAdApplication({ approvalStatus: "approved", isVisible: false })
    ).toBe(false);
    expect(
      isStoreEligibleForOwnerAdApplication({ approvalStatus: "suspended", isVisible: true })
    ).toBe(false);
  });

  it("pricing NOT_CONFIGURED — no charge collection", () => {
    expect(DELIVERY_AD_OWNER_PRICING_PRODUCT.status).toBe("NOT_CONFIGURED");
    expect(DELIVERY_AD_OWNER_PRICING_PRODUCT.chargeCollection).toBe(false);
  });

  it("Owner routes exist for hub/create/detail; no banner create page", () => {
    expect(DELIVERY_AD_OWNER_ROUTES.hub).toBe("/stores/owner/ads");
    expect(DELIVERY_AD_OWNER_ROUTES.createStoreSponsored).toContain("store-sponsored");
    const bannerPage = resolve(
      process.cwd(),
      "app/(main)/stores/owner/ads/new/banner/page.tsx"
    );
    let exists = true;
    try {
      readFileSync(bannerPage);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it("C18 organic isolation modules still free of owner writer", () => {
    const ranking = resolve(process.cwd(), "lib/stores/discovery/load-store-discovery-ranked-live.ts");
    const src = readFileSync(ranking, "utf8");
    expect(src).not.toMatch(/owner-store-sponsored-writer/);
    expect(src).not.toMatch(/store_paid_ad_campaigns/);
  });
});
