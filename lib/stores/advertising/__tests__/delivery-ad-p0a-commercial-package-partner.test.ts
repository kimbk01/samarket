/**
 * P0-A Delivery Ads commercial package / Partner SSOT — targeted contract tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_CAMPAIGN_SOURCES,
  DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT,
  DELIVERY_AD_PACKAGE_SEED_CODES,
  DELIVERY_AD_PARTNER_ORGANIC_EFFECT,
  assertCampaignCommercialSnapshotImmutable,
  buildCampaignCommercialSnapshotFromQuote,
  calculateDeliveryAdCommercialQuote,
  calculateDeliveryAdExtensionQuote,
  type DeliveryAdPackageRow,
  type DeliveryAdPlacementCommercialRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";

const root = process.cwd();
const mig = () =>
  readFileSync(
    join(root, "supabase/migrations/20261201195000_delivery_ads_p0a_commercial_package_partner.sql"),
    "utf8"
  );
const contractSrc = () =>
  readFileSync(join(root, "lib/stores/advertising/delivery-ad-commercial-contract.ts"), "utf8");
const catalogSrc = () =>
  readFileSync(join(root, "lib/stores/advertising/delivery-ad-commercial-catalog.ts"), "utf8");
const adminSrc = () =>
  readFileSync(join(root, "lib/stores/advertising/delivery-ad-commercial-admin-writer.ts"), "utf8");
const ownerHub = () =>
  readFileSync(join(root, "components/business/owner/ads/OwnerDeliveryAdsHubView.tsx"), "utf8");
const ownerSponsored = () =>
  readFileSync(
    join(root, "components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx"),
    "utf8"
  );
const ownerBanner = () =>
  readFileSync(join(root, "components/business/owner/ads/OwnerBannerCreateView.tsx"), "utf8");
const adminHub = () =>
  readFileSync(join(root, "components/admin/stores/AdminDeliveryAdsControlPlane.tsx"), "utf8");
const composition = () =>
  readFileSync(
    join(root, "lib/stores/composition/stores-composition-insertion-live.ts"),
    "utf8"
  );

function pkg(overrides: Partial<DeliveryAdPackageRow> = {}): DeliveryAdPackageRow {
  return {
    id: "pkg-1",
    productKind: "store_sponsored",
    inventoryKey: "STORES_HOME_FEED",
    code: "7_day",
    displayName: "7 days",
    durationDays: 7,
    priceAmountMinor: 10_000_00,
    currency: "PHP",
    enabled: true,
    displayOrder: 10,
    ...overrides,
  };
}

function placement(
  overrides: Partial<DeliveryAdPlacementCommercialRow> = {}
): DeliveryAdPlacementCommercialRow {
  return {
    productKind: "store_sponsored",
    inventoryKey: "STORES_HOME_FEED",
    sellable: true,
    ...overrides,
  };
}

const partnerOff = {
  membershipId: null as string | null,
  active: false,
  advertisingDiscountPercent: 0,
  benefitSnapshot: {},
};

describe("P0-A delivery ad commercial SSOT", () => {
  it("T1 — product × placement × package lookup contract", () => {
    const quote = calculateDeliveryAdCommercialQuote({
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      package: pkg(),
      placement: placement(),
      productEnabled: true,
      acceptingApplications: true,
      partner: partnerOff,
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.packageId).toBe("pkg-1");
    expect(quote.durationDays).toBe(7);
    expect(quote.finalPayableMinor).toBe(10_000_00);

    const banner = calculateDeliveryAdCommercialQuote({
      productKind: "banner",
      inventoryKey: "STORES_HOME_HERO",
      package: pkg({
        productKind: "banner",
        inventoryKey: "STORES_HOME_HERO",
        id: "pkg-b",
        priceAmountMinor: 20_000_00,
      }),
      placement: placement({ productKind: "banner", inventoryKey: "STORES_HOME_HERO" }),
      productEnabled: true,
      acceptingApplications: true,
      partner: partnerOff,
    });
    expect(banner.ok).toBe(true);
  });

  it("T2 — no price constant authority in Owner/client path or commercial contract", () => {
    expect(contractSrc()).not.toMatch(/priceAmountMinor:\s*[1-9]/);
    expect(contractSrc()).not.toMatch(/point_cost|pointCost/);
    expect(ownerHub() + ownerSponsored() + ownerBanner()).not.toMatch(
      /delivery-ad-commercial|priceAmountMinor|10_000_00/
    );
    expect(mig()).toMatch(/price_amount_minor NULL/);
    expect(mig()).toMatch(/enabled, display_order[\s\S]*false/);
  });

  it("T3 — Partner discount calculation", () => {
    const quote = calculateDeliveryAdCommercialQuote({
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      package: pkg({ priceAmountMinor: 10_000 }),
      placement: placement(),
      productEnabled: true,
      acceptingApplications: true,
      partner: {
        membershipId: "m1",
        active: true,
        advertisingDiscountPercent: 10,
        benefitSnapshot: { advertising_package_discount: true },
      },
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.basePriceMinor).toBe(10_000);
    expect(quote.finalPayableMinor).toBe(9_000);
    expect(quote.partnerDiscountPercent).toBe(10);
  });

  it("T4 — Partner does not affect organic ranking", () => {
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT).toEqual({
      organicRankingBoost: false,
      organicInjection: false,
      bypassSponsoredLabel: false,
      altersOrganicEligibility: false,
    });
    expect(composition()).not.toMatch(/delivery_ad_partner|partner_membership/);
    expect(adminSrc()).not.toMatch(/organic.?score|boostOrganic|injectOrganic/i);
  });

  it("T5 — historical snapshot immutable after catalog edit", () => {
    const quote = calculateDeliveryAdCommercialQuote({
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      package: pkg({ priceAmountMinor: 5000 }),
      placement: placement(),
      productEnabled: true,
      acceptingApplications: true,
      partner: partnerOff,
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    const snap = buildCampaignCommercialSnapshotFromQuote({
      campaignId: "c1",
      quote,
    });
    const afterCatalogEdit = {
      ...snap,
      // catalog would change live package price; snapshot row must stay same fields
    };
    expect(assertCampaignCommercialSnapshotImmutable(snap, afterCatalogEdit)).toBe(true);
    expect(snap.finalPayableMinor).toBe(5000);
    // Simulating a mutated snapshot would fail immutability check:
    expect(
      assertCampaignCommercialSnapshotImmutable(snap, {
        ...snap,
        finalPayableMinor: 9999,
      })
    ).toBe(false);
  });

  it("T6 — disabled package not sellable", () => {
    const quote = calculateDeliveryAdCommercialQuote({
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      package: pkg({ enabled: false }),
      placement: placement(),
      productEnabled: true,
      acceptingApplications: true,
      partner: partnerOff,
    });
    expect(quote).toEqual({ ok: false, error: "package_disabled" });
  });

  it("T7 — missing price fail closed", () => {
    const quote = calculateDeliveryAdCommercialQuote({
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      package: pkg({ priceAmountMinor: null }),
      placement: placement(),
      productEnabled: true,
      acceptingApplications: true,
      partner: partnerOff,
    });
    expect(quote).toEqual({ ok: false, error: "price_not_configured" });
  });

  it("T8 — client final amount ignored / recomputed", () => {
    const quote = calculateDeliveryAdCommercialQuote({
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      package: pkg({ priceAmountMinor: 8000 }),
      placement: placement(),
      productEnabled: true,
      acceptingApplications: true,
      partner: partnerOff,
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    const snap = buildCampaignCommercialSnapshotFromQuote({
      campaignId: "c2",
      quote,
      clientFinalPayableMinor: 1,
    });
    expect(snap.finalPayableMinor).toBe(8000);
    expect(catalogSrc()).toContain("void input.clientFinalPayableMinor");
  });

  it("T9 — banner/sponsored same commercial authority", () => {
    expect(contractSrc()).toContain("calculateDeliveryAdCommercialQuote");
    expect(adminSrc()).not.toMatch(/bannerPricing|sponsoredPricingService/);
    expect(DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT.store_sponsored).toContain("STORES_HOME_FEED");
    expect(DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT.banner).toContain("STORES_HOME_HERO");
  });

  it("T10 — extension price calculation", () => {
    const ext = calculateDeliveryAdExtensionQuote({
      policy: {
        extensionEnabled: true,
        additionalDayPriceMinor: 1000,
        currency: "PHP",
        minimumExtensionDays: 1,
        maximumExtensionDays: 30,
        extensionUnitDays: 1,
      },
      requestedDays: 5,
      previousEndAtIso: "2026-09-01T00:00:00.000Z",
    });
    expect(ext.ok).toBe(true);
    if (!ext.ok) return;
    expect(ext.daysAdded).toBe(5);
    expect(ext.finalExtensionAmountMinor).toBe(5000);
    expect(ext.newEndAt.startsWith("2026-09-06")).toBe(true);
  });

  it("T11 — free Admin extension distinguishable", () => {
    const free = calculateDeliveryAdExtensionQuote({
      policy: {
        extensionEnabled: false,
        additionalDayPriceMinor: null,
        currency: "PHP",
        minimumExtensionDays: 1,
        maximumExtensionDays: 30,
        extensionUnitDays: 1,
      },
      requestedDays: 3,
      previousEndAtIso: "2026-09-01T00:00:00.000Z",
      extensionKind: "ADMIN_FREE_COMPENSATION",
    });
    expect(free.ok).toBe(true);
    if (!free.ok) return;
    expect(free.extensionKind).toBe("ADMIN_FREE_COMPENSATION");
    expect(free.finalExtensionAmountMinor).toBe(0);
    expect(mig()).toContain("ADMIN_FREE_COMPENSATION");
  });

  it("T12 — DIBAY_FIRST_PARTY has no Owner charge", () => {
    const quote = calculateDeliveryAdCommercialQuote({
      productKind: "banner",
      inventoryKey: "STORES_HOME_HERO",
      package: pkg({
        productKind: "banner",
        inventoryKey: "STORES_HOME_HERO",
        priceAmountMinor: null,
        enabled: false,
      }),
      placement: placement({ productKind: "banner", inventoryKey: "STORES_HOME_HERO" }),
      productEnabled: true,
      acceptingApplications: true,
      partner: {
        membershipId: "m1",
        active: true,
        advertisingDiscountPercent: 50,
        benefitSnapshot: {},
      },
      campaignSource: "DIBAY_FIRST_PARTY",
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.finalPayableMinor).toBe(0);
    expect(quote.partnerDiscountPercent).toBe(0);
    expect(quote.commercialStatus).toBe("FIRST_PARTY_NO_CHARGE");
    expect(DELIVERY_AD_CAMPAIGN_SOURCES).toContain("DIBAY_FIRST_PARTY");
  });

  it("T13 — cross-owner financial read blocked by RLS contract", () => {
    const sql = mig();
    expect(sql).toContain("delivery_ad_campaign_commercial_snapshots_select");
    expect(sql).toContain("s.owner_user_id = auth.uid()");
    expect(sql).toContain("is_platform_admin(auth.uid())");
    expect(sql).not.toMatch(
      /CREATE POLICY delivery_ad_campaign_commercial_snapshots_select[\s\S]*USING \(true\)/
    );
  });

  it("T14 — placement max/interval authority not duplicated", () => {
    const sql = mig();
    expect(sql).not.toMatch(/interval_every|max_insertion|maxInsertion/);
    expect(sql).toContain("Does NOT own max/interval");
    expect(sql).toContain("delivery_ad_placement_commercial");
  });

  it("T15 — Trade/Feed/D-Point tables not used as Delivery authority", () => {
    const src = contractSrc() + catalogSrc() + adminSrc() + mig();
    expect(src).not.toMatch(/\bfeed_ad_products\b/);
    expect(src).not.toMatch(/\bpoint_promotion_orders\b/);
    expect(src).not.toMatch(/\bfrom\(["']ad_products["']\)/);
    expect(src).not.toMatch(/\bpoint_cost\b/);
    expect(src).not.toMatch(/promotion-products/);
    expect(DELIVERY_AD_PACKAGE_SEED_CODES).toEqual(["7_day", "15_day", "30_day"]);
  });

  it("P0-A UI hard lock — Owner/Admin ads views not importing commercial writers", () => {
    const ui = ownerHub() + ownerSponsored() + ownerBanner() + adminHub();
    expect(ui).not.toContain("delivery-ad-commercial");
    expect(ui).not.toContain("calculateDeliveryAdCommercialQuote");
  });
});
