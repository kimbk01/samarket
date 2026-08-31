/**
 * UI-1 — Owner step-gated application wizard (design board wins over P0-C scroll-all).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_OWNER_APPLICATION_STEPS,
} from "@/lib/stores/advertising/delivery-ad-design-board-contract";
import {
  canAdvanceOwnerApplicationStep,
  parseOwnerDeliveryAdApplicationStep,
  OWNER_DELIVERY_AD_APPLICATION_STEP_COUNT as STEP_COUNT,
} from "@/lib/stores/advertising/owner-delivery-ad-application-step";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("UI-1 Owner step-gated application flow", () => {
  it("UI1-T1 — 4 application steps in design board contract", () => {
    expect(DELIVERY_AD_OWNER_APPLICATION_STEPS).toHaveLength(4);
    expect(STEP_COUNT).toBe(4);
  });

  it("UI1-T2 — step parse defaults to 1 and accepts 2–4", () => {
    expect(parseOwnerDeliveryAdApplicationStep(null)).toBe(1);
    expect(parseOwnerDeliveryAdApplicationStep("")).toBe(1);
    expect(parseOwnerDeliveryAdApplicationStep("2")).toBe(2);
    expect(parseOwnerDeliveryAdApplicationStep("4")).toBe(4);
    expect(parseOwnerDeliveryAdApplicationStep("99")).toBe(1);
  });

  it("UI1-T3 — canAdvance gates step 1–3 only", () => {
    expect(
      canAdvanceOwnerApplicationStep({
        step: 1,
        storeId: "s1",
        inventoryKey: "STORES_HOME_FEED",
        packageId: "",
        hasQuote: false,
        noSellablePackages: false,
      })
    ).toBe(true);
    expect(
      canAdvanceOwnerApplicationStep({
        step: 1,
        storeId: "",
        inventoryKey: "",
        packageId: "",
        hasQuote: false,
        noSellablePackages: false,
      })
    ).toBe(false);
    expect(
      canAdvanceOwnerApplicationStep({
        step: 2,
        storeId: "s1",
        inventoryKey: "STORES_HOME_FEED",
        packageId: "p1",
        hasQuote: true,
        noSellablePackages: false,
      })
    ).toBe(true);
    expect(
      canAdvanceOwnerApplicationStep({
        step: 4,
        storeId: "s1",
        inventoryKey: "STORES_HOME_FEED",
        packageId: "p1",
        hasQuote: true,
        noSellablePackages: false,
      })
    ).toBe(false);
  });

  it("UI1-T4 — store-sponsored uses single-page workspace", () => {
    const src = read("components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx");
    expect(src).toContain('data-owner-ads-wizard="single-page"');
    expect(src).not.toContain("OwnerDeliveryAdApplicationWizardShell");
    expect(src).not.toContain("parseOwnerDeliveryAdApplicationStep");
    expect(src).toContain("DeliveryAdOwnerInsufficientCashSubmitModal");
    expect(src).toContain("/api/me/delivery-ads/placement-preview");
  });

  it("UI1-T5 — banner uses single-page workspace with creative mode A/B", () => {
    const src = read("components/business/owner/ads/OwnerBannerCreateView.tsx");
    expect(src).toContain('data-owner-ads-wizard="single-page"');
    expect(src).toContain('data-owner-ads-creative-mode="choice"');
    expect(src).toContain("owner_upload");
    expect(src).toContain("admin_produce");
    expect(src).toContain("upload-banner-image");
    expect(src).toContain("adminProducesCreative");
    expect(src).toContain("DeliveryAdOwnerInsufficientCashSubmitModal");
    expect(src).not.toContain("OwnerDeliveryAdApplicationWizardShell");
  });

  it("UI1-T6 — hub 5-col action KPI + store on cards", () => {
    const hub = read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    expect(hub).toContain("grid-cols-5");
    expect(hub).toContain("data-owner-ads-hub-card-store");
    expect(hub).toContain("data-owner-ads-ended-campaigns");
  });

  it("UI1-T7 — detail lifecycle-native layout marker", () => {
    const detail = read("components/business/owner/ads/OwnerDeliveryAdDetailView.tsx");
    expect(detail).toContain('data-owner-ads-detail-layout="lifecycle-native"');
    expect(detail).toContain("DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS");
    expect(detail).not.toContain("Sam.btn");
  });

  it("UI1-T8 — partner benefits + store sheet", () => {
    const partner = read("components/business/owner/ads/OwnerDeliveryAdPartnerView.tsx");
    expect(partner).toContain("data-owner-ads-partner-benefits");
    expect(partner).toContain("owner_ads_partner_benefits_title");
    expect(partner).toContain("DibayBottomSheet");
    expect(partner).toContain("data-owner-ads-store-trigger");
  });
});
