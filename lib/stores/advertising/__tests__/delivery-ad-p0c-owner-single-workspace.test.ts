/**
 * P0-C — Owner Ad Center + single-workspace application contracts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_PARTNER_ORGANIC_EFFECT,
  calculateDeliveryAdCommercialQuote,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  decodeOwnerAdPackagePricingModel,
  encodeOwnerAdPackagePricingModel,
  scheduleWindowFromPackageDurationDays,
  OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
} from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { listSellablePackagesForOwnerWorkspace } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import type { DeliveryAdCommercialCatalogReadModel } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const hub = () => read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
const sponsored = () => read("components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx");
const banner = () => read("components/business/owner/ads/OwnerBannerCreateView.tsx");
const detail = () => read("components/business/owner/ads/OwnerDeliveryAdDetailView.tsx");
const actionsApi = () =>
  read("app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts");
const commercialApi = () => read("app/api/me/delivery-ads/commercial/route.ts");
const i18n = () => read("lib/i18n/catalog/owner-delivery-ads.ts");

describe("P0-C Owner Ad Center + single-workspace", () => {
  it("T1 — hub has one primary application CTA", () => {
    const src = hub();
    expect(src).toContain('data-owner-ads-primary-cta="apply"');
    expect(src.match(/data-owner-ads-primary-cta/g)?.length).toBe(1);
  });

  it("T2 — product selector has Store Promotion + Banner", () => {
    const src = hub();
    expect(src).toContain('data-owner-ads-product-select="1"');
    expect(src).toContain("owner_ads_product_store_sponsored");
    expect(src).toContain("owner_ads_product_banner");
    expect(src).toContain("DELIVERY_AD_OWNER_ROUTES.createStoreSponsored");
    expect(src).toContain("DELIVERY_AD_OWNER_ROUTES.createBanner");
    expect(DELIVERY_AD_OWNER_ROUTES.createStoreSponsored).toContain("store-sponsored");
    expect(DELIVERY_AD_OWNER_ROUTES.createBanner).toContain("banner");
  });

  it("T3 — Store Promotion no wizard authority", () => {
    const src = sponsored();
    expect(src).toContain('data-owner-ads-wizard="absent"');
    expect(src).toContain('data-owner-ads-workspace="store-sponsored"');
    expect(src).not.toMatch(/setStep\(|Step\s*=\s*"|nextStep|previousStep/);
  });

  it("T4 — Banner no wizard authority", () => {
    const src = banner();
    expect(src).toContain('data-owner-ads-wizard="absent"');
    expect(src).toContain('data-owner-ads-workspace="banner"');
    expect(src).not.toMatch(/setStep\(|Step\s*=\s*"|nextStep|previousStep/);
  });

  it("T5 — packages loaded dynamically from commercial API", () => {
    expect(sponsored()).toContain("/api/me/delivery-ads/commercial");
    expect(banner()).toContain("/api/me/delivery-ads/commercial");
    expect(commercialApi()).toContain("listSellablePackagesForOwnerWorkspace");
  });

  it("T6 — no hardcoded payable price in Owner create UI", () => {
    for (const src of [sponsored(), banner()]) {
      expect(src).not.toMatch(/₱\d{2,}/);
      expect(src).not.toMatch(/priceAmountMinor:\s*\d+/);
      expect(src).not.toMatch(/finalPayableMinor:\s*[1-9]/);
    }
  });

  it("T7 — unconfigured packages fail closed", () => {
    const catalog: DeliveryAdCommercialCatalogReadModel = {
      products: [
        {
          key: "store_sponsored",
          displayName: "Store",
          description: null,
          enabled: true,
          acceptingApplications: true,
        },
      ],
      placements: [
        { productKind: "store_sponsored", inventoryKey: "STORES_HOME_FEED", sellable: true },
      ],
      packages: [
        {
          id: "p1",
          productKind: "store_sponsored",
          inventoryKey: "STORES_HOME_FEED",
          code: "7_day",
          displayName: "7",
          durationDays: 7,
          priceAmountMinor: null,
          currency: "PHP",
          enabled: false,
          displayOrder: 1,
        },
      ],
      extensionPolicy: null,
      partnerConfig: null,
    };
    const listed = listSellablePackagesForOwnerWorkspace({
      catalog,
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      partner: {
        membershipId: null,
        active: false,
        advertisingDiscountPercent: 0,
        benefitSnapshot: {},
      },
    });
    expect(listed.every((r) => !r.quote.ok)).toBe(true);
    expect(i18n()).toContain("owner_ads_no_sellable_packages");
    expect(sponsored()).toContain("owner_ads_no_sellable_packages");
  });

  it("T8 — Partner discount displayed from server quote fields", () => {
    expect(sponsored()).toContain("partnerDiscountPercent");
    expect(sponsored()).toContain("owner_ads_price_partner_discount");
    expect(sponsored()).not.toContain("calculateDeliveryAdCommercialQuote");
  });

  it("T9 — server recomputes quote on submit", () => {
    expect(actionsApi()).toContain("attachOwnerPaidCommercialSnapshotOnSubmit");
    expect(actionsApi()).toContain("quote_stale");
  });

  it("T10 — stale quote cannot submit silently", () => {
    const bind = read("lib/stores/advertising/owner-delivery-ad-commercial-bind.ts");
    expect(bind).toContain("client_payable_mismatch");
    expect(actionsApi()).toContain("refreshQuote");
    expect(actionsApi()).toContain("quote_stale");
    expect(sponsored()).toMatch(/quote_stale|refreshQuote/);
  });

  it("T11 — Store preview canonical + telemetry-free", () => {
    const src = sponsored();
    expect(src).toMatch(/DeliveryAdCampaignPlacementPreviews|PlacementPreview/);
    expect(src).not.toMatch(/recordImpression|trackClick|attribution/);
  });

  it("T12 — Banner Owner creative upload absent", () => {
    const src = banner();
    expect(src).not.toMatch(/type=["']file["']/);
    expect(src).not.toMatch(/input.*accept=["']image/);
    expect(src).not.toMatch(/crop|Cropper|ImageCrop/);
    expect(src).toContain("adminProducesCreative: true");
  });

  it("T13 — Banner Admin-production copy present", () => {
    expect(banner()).toContain('data-owner-ads-admin-creative="true"');
    expect(banner()).toContain("owner_ads_banner_admin_creative_notice");
    expect(OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET).toContain("admin-production");
  });

  it("T14 — Owner footer uses canonical above-nav authority", () => {
    for (const src of [sponsored(), banner(), detail()]) {
      expect(src).toContain("useOwnerAdminFormKeyboard");
      expect(src).toContain("aboveBottomNav: true");
      expect(src).toContain('data-owner-ads-footer="owner-admin-ssot"');
    }
  });

  it("T15 — no ads-local bottom 60px geometry", () => {
    for (const src of [sponsored(), banner(), detail(), hub()]) {
      expect(src).not.toContain("calc(60px");
      expect(src).not.toMatch(/bottom-0(?![^\n]*nav)/);
    }
  });

  it("T16/T17 — changing store/package invalidates quote", () => {
    const src = sponsored();
    expect(src).toMatch(/setPackageId\(null\)|setQuote\(|packageId/);
    expect(src).toContain("storeId");
    expect(src).toContain("/api/me/delivery-ads/commercial");
  });

  it("T18 — detail renders immutable commercial snapshot / pkg binding", () => {
    expect(detail()).toContain("decodeOwnerAdPackagePricingModel");
    expect(detail()).toContain('data-owner-ads-detail-section="commercial"');
    expect(encodeOwnerAdPackagePricingModel("abc")).toBe("pkg:abc");
    expect(decodeOwnerAdPackagePricingModel("pkg:abc")).toBe("abc");
  });

  it("T19 — Partner has zero organic ranking effect", () => {
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT.organicRankingBoost).toBe(false);
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT.organicInjection).toBe(false);
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT.bypassSponsoredLabel).toBe(false);
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT.altersOrganicEligibility).toBe(false);
  });

  it("T20 — Business Cash is summary only; no fake top-up or charge copy on create", () => {
    expect(hub()).toContain('data-owner-ads-business-cash="summary"');
    expect(hub()).not.toContain('data-owner-ads-business-cash="stub"');
    expect(sponsored()).not.toMatch(/결제 완료|Business Cash 차감|광고비 결제됨/);
    expect(banner()).not.toMatch(/결제 완료|Business Cash 차감/);
  });

  it("T21 — Owner create UI does not expose raw inventory enums as primary labels", () => {
    expect(sponsored()).toContain("deliveryAdCommercialPlacementLabel");
    expect(banner()).toContain("deliveryAdCommercialPlacementLabel");
  });

  it("T22 — no hidden duplicate wizard flow", () => {
    expect(sponsored()).not.toContain('step === "store"');
    expect(banner()).not.toContain('step === "setup"');
    expect(sponsored()).toContain('data-owner-ads-wizard="absent"');
    expect(banner()).toContain('data-owner-ads-wizard="absent"');
  });

  it("schedule helper derives duration window", () => {
    const w = scheduleWindowFromPackageDurationDays(7, Date.parse("2026-08-30T12:00:00.000Z"));
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const start = Date.parse(w.startAtIso);
    const end = Date.parse(w.endAtIso);
    expect(end - start).toBe(7 * 86_400_000);
  });

  it("fail-closed quote rejects null price", () => {
    const q = calculateDeliveryAdCommercialQuote({
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      package: {
        id: "x",
        productKind: "store_sponsored",
        inventoryKey: "STORES_HOME_FEED",
        code: "7_day",
        displayName: "7",
        durationDays: 7,
        priceAmountMinor: null,
        currency: "PHP",
        enabled: false,
        displayOrder: 1,
      },
      placement: {
        productKind: "store_sponsored",
        inventoryKey: "STORES_HOME_FEED",
        sellable: true,
      },
      productEnabled: true,
      acceptingApplications: true,
      partner: {
        membershipId: null,
        active: false,
        advertisingDiscountPercent: 0,
        benefitSnapshot: {},
      },
    });
    expect(q.ok).toBe(false);
  });
});
