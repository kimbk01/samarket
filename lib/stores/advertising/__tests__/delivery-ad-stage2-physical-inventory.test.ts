/**
 * Stage 2 — Customer physical inventory authority contracts (HOME + PRIMARY + SECONDARY).
 * S2-T1 … S2-T24 focused tests. No Owner UX / no finance mutations.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_STAGE2_CONTENT_COLUMN,
  DELIVERY_AD_STAGE2_SURFACE_CONTRACT,
  STAGE2_BANNER_ADS_DEFAULT,
  STAGE2_BANNER_CONTENT_MODEL,
  STAGE2_BROWSE_PHYSICAL_ORDER,
  STAGE2_BROWSE_TOP_GEOMETRY,
  STAGE2_HOME_BEFORE_REST_GEOMETRY,
  STAGE2_HOME_HERO_GEOMETRY,
  STAGE2_HOME_PHYSICAL_ORDER,
  STAGE2_HUMAN_LABELS_KO,
  STAGE2_REJECTED_PHYSICAL_SLOTS,
  bannerAdsFromProductConfig,
  stage2PhysicalBannerExposureAllowed,
  withBannerAdsProductConfig,
} from "@/lib/stores/advertising/delivery-ad-stage2-surface-contract";
import {
  isRuntimeActiveInventory,
  inventorySeedByKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import {
  BANNER_AD_DB_SURFACES,
  INVENTORY_KEY_TO_BANNER_DB_SURFACE,
} from "@/lib/stores/advertising/delivery-ad-placement";
import { DELIVERY_AD_BANNER_RENDERER_CONTRACT } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { STORES_SEARCH_TOP_LAUNCH } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import { DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { validateOwnerBannerInventory } from "@/lib/stores/advertising/owner-banner-contract";
import {
  ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS,
  validateAdminFirstPartyBannerInventory,
} from "@/lib/stores/advertising/delivery-ad-admin-first-party-writer";
import {
  planStoresBrowseInsertions,
  planStoresHomeRestPaidInsertions,
  homeBannerBeforeRestPolicyEnabled,
  homePaidAdInsertionPolicyEnabled,
} from "@/lib/stores/composition/stores-composition-insertion-live";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import type { StoresBrowseScopePolicyRow } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";

const root = process.cwd();

const baseAd = (
  overrides: Partial<StorePaidAdCampaignRow> & Pick<StorePaidAdCampaignRow, "id" | "storeId">
): StorePaidAdCampaignRow => ({
  id: overrides.id,
  storeId: overrides.storeId,
  placement: overrides.placement ?? "stores_browse",
  title: overrides.title ?? `ad-${overrides.id}`,
  headline: overrides.headline ?? "headline",
  bodyCopy: overrides.bodyCopy ?? null,
  imageUrl: overrides.imageUrl ?? null,
  startAt: overrides.startAt ?? "2026-06-01T00:00:00.000Z",
  endAt: overrides.endAt ?? "2026-07-01T00:00:00.000Z",
  isActive: overrides.isActive ?? true,
});

function browsePolicyAdOn(interval: number, max: number) {
  return STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
    r.slot === "future_ad_insertion"
      ? { ...r, enabled: true, max, interval: { consumed: false as const, reason: "NOT_CONSUMED" as const } }
      : r
  );
}

function organicRelativeOrder(rows: Array<{ kind: string; storeId: string }>): string[] {
  return rows.filter((r) => r.kind === "organic").map((r) => r.storeId);
}

function hubSrc() {
  return readFileSync(join(root, "components/stores/home/hub/StoresHomeHub.tsx"), "utf8");
}
function beforeRestSrc() {
  return readFileSync(
    join(root, "components/stores/home/hub/StoresHomeBeforeRestBanner.tsx"),
    "utf8"
  );
}
function browseTopSrc() {
  return readFileSync(join(root, "components/stores/browse/StoresBrowseTopBanner.tsx"), "utf8");
}
function browseViewSrc() {
  return readFileSync(join(root, "components/stores/browse/StoresBrowsePrimaryView.tsx"), "utf8");
}
function canonicalCashSrc() {
  return readFileSync(
    join(root, "lib/stores/advertising/canonical-business-cash-contract.ts"),
    "utf8"
  );
}

describe("Stage 2 — physical inventory authority", () => {
  it("S2-T1 HOME native uses canonical rest_stores insertion", () => {
    expect(hubSrc()).toContain("homeInsertions");
    const organic = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const plan = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "h1", storeId: "a", placement: "stores_home" })],
      intervalEveryN: 4,
      max: 2,
      surfaceAllowed: true,
    });
    expect(plan.adCount).toBe(1);
    expect(plan.rows.some((r) => r.kind === "paid_ad")).toBe(true);
  });

  it("S2-T2 HOME native does not alter organic ranking/order", () => {
    const organic = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const plan = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "h1", storeId: "p1", placement: "stores_home" })],
      intervalEveryN: 3,
      max: 1,
      surfaceAllowed: true,
    });
    expect(plan.organicIds).toEqual(organic);
    const remainingOrganic = organicRelativeOrder(plan.rows);
    expect(remainingOrganic).toEqual(organic.filter((id) => id !== "p1"));
  });

  it("S2-T3 primary native planner only inserts when surfaceAllowed + policy", () => {
    const organic = ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "c1", storeId: "o4", placement: "stores_browse" })],
      policy: browsePolicyAdOn(4, 1),
    });
    expect(plan.adCount).toBe(1);
    expect(plan.organicIds).toEqual(organic);
  });

  it("S2-T4/S2-T5 secondary native inherit + banner override; unrelated taxonomy gated by organic set", () => {
    const primary: StoresBrowseScopePolicyRow = {
      scopeKey: "food",
      primarySlug: "food",
      subSlug: null,
      enabled: true,
      displayTitleKo: null,
      displayTitleEn: null,
      adEnabled: true,
      couponEnabled: false,
      maxInsertion: 2,
      intervalEveryN: 6,
      presentationMode: "card_benefit_integrated",
      scheduleStart: null,
      scheduleEnd: null,
      productConfig: withBannerAdsProductConfig(null, {
        enabled: true,
        position: "top_context",
        capacity: 1,
      }),
    };
    const primaryAll = resolveBrowseScopePolicy({
      primarySlug: "food",
      subSlug: null,
      primaryRow: primary,
      subRow: null,
    });
    expect(primaryAll.adEnabled).toBe(true);
    expect(primaryAll.bannerAds.enabled).toBe(true);

    const secondaryInherit = resolveBrowseScopePolicy({
      primarySlug: "food",
      subSlug: "korean",
      primaryRow: primary,
      subRow: null,
    });
    expect(secondaryInherit.adEnabled).toBe(true);
    expect(secondaryInherit.bannerAds.enabled).toBe(true);

    const secondaryOverride: StoresBrowseScopePolicyRow = {
      ...primary,
      scopeKey: "food:korean",
      subSlug: "korean",
      adEnabled: false,
      productConfig: withBannerAdsProductConfig(null, {
        enabled: false,
        position: "top_context",
        capacity: 1,
      }),
    };
    const secondaryOwn = resolveBrowseScopePolicy({
      primarySlug: "food",
      subSlug: "korean",
      primaryRow: primary,
      subRow: secondaryOverride,
    });
    expect(secondaryOwn.adEnabled).toBe(false);
    expect(secondaryOwn.bannerAds.enabled).toBe(false);

    const organic = ["s1", "s2", "s3", "s4"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [
        baseAd({ id: "ok", storeId: "s2", placement: "stores_browse" }),
        baseAd({ id: "unrelated", storeId: "other-taxonomy", placement: "stores_browse" }),
      ],
      policy: browsePolicyAdOn(2, 5),
    });
    expect(plan.rows.some((r) => r.kind === "paid_ad" && r.storeId === "other-taxonomy")).toBe(
      false
    );
    expect(plan.rows.some((r) => r.kind === "paid_ad" && r.storeId === "s2")).toBe(true);
  });

  it("S2-T6 HOME Banner physical slot belongs to HOME composition", () => {
    const row = STORES_HOME_COMPOSITION_DEFAULT_POLICY.find(
      (r) => r.slot === "homeBannerBeforeRest"
    );
    expect(row?.contentType).toBe("banner");
    expect(row?.enabled).toBe(false);
    expect(hubSrc()).toContain("StoresHomeBeforeRestBanner");
  });

  it("S2-T7/S2-T8 disabling HOME physical slot / commercial cannot override", () => {
    expect(
      homeBannerBeforeRestPolicyEnabled(
        STORES_HOME_COMPOSITION_DEFAULT_POLICY.map((r) => ({ ...r }))
      )
    ).toBe(false);
    expect(
      stage2PhysicalBannerExposureAllowed({
        physicalEnabled: false,
        commercialSellable: true,
        campaignEligible: true,
      })
    ).toBe(false);
    expect(
      stage2PhysicalBannerExposureAllowed({
        physicalEnabled: true,
        commercialSellable: false,
        campaignEligible: true,
      })
    ).toBe(false);
  });

  it("S2-T9/S2-T10/S2-T11 PRIMARY/SECONDARY Banner policy on category authority", () => {
    expect(STAGE2_BANNER_ADS_DEFAULT.enabled).toBe(false);
    expect(bannerAdsFromProductConfig(null).enabled).toBe(false);
    expect(
      bannerAdsFromProductConfig({
        bannerAds: { enabled: true, capacity: 2 },
      }).capacity
    ).toBe(2);
  });

  it("S2-T12 Banner does not use native insertion planner", () => {
    expect(beforeRestSrc()).not.toContain("planStoresHomeRestPaidInsertions");
    expect(browseTopSrc()).not.toContain("planStoresBrowseInsertions");
    expect(beforeRestSrc()).toContain("DeliveryAdBanner");
    expect(browseTopSrc()).toContain("DeliveryAdBanner");
  });

  it("S2-T13 Banner fixed slot does not repeat on organic continuation", () => {
    expect(STAGE2_HOME_BEFORE_REST_GEOMETRY.continuation).toBe("fixed_once_per_surface");
    expect(STAGE2_BROWSE_TOP_GEOMETRY.continuation).toBe("fixed_once_per_surface");
    expect(beforeRestSrc()).toContain("fixed_once_per_surface");
    expect(browseTopSrc()).toContain("fixed_once_per_surface");
  });

  it("S2-T14 native pagination leaves organic cursor unchanged (planner preserves organicIds)", () => {
    const organic = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [
        baseAd({ id: "c1", storeId: "3", placement: "stores_browse" }),
        baseAd({ id: "c2", storeId: "7", placement: "stores_browse" }),
      ],
      policy: browsePolicyAdOn(4, 2),
    });
    expect(plan.organicIds).toEqual(organic);
  });

  it("S2-T15 HERO 39:16 preserved", () => {
    expect(STAGE2_HOME_HERO_GEOMETRY.ratioLabel).toBe("39:16");
    const hero = inventorySeedByKey("STORES_HOME_HERO");
    expect(hero.aspectRatioWidth).toBe(39);
    expect(hero.aspectRatioHeight).toBe(16);
  });

  it("S2-T16 every new Banner slot has measured geometry contract", () => {
    for (const g of [STAGE2_HOME_BEFORE_REST_GEOMETRY, STAGE2_BROWSE_TOP_GEOMETRY]) {
      expect(g.ratioLabel).toBe("2:1");
      expect(g.aspectW / g.aspectH).toBeCloseTo(2);
      expect(g.measuredInnerWidths[375]).toBe(DELIVERY_AD_STAGE2_CONTENT_COLUMN.widths[375]);
      expect(g.measuredInnerWidths[820]).toBe(DELIVERY_AD_STAGE2_CONTENT_COLUMN.widths[820]);
      expect(g.recommendedWidth).toBeGreaterThan(g.minimumWidth);
    }
    expect(STAGE2_HOME_BEFORE_REST_GEOMETRY.ratioLabel).not.toBe("39:16");
    expect(STAGE2_BROWSE_TOP_GEOMETRY.ratioLabel).not.toBe("3:1");
  });

  it("S2-T17 SEARCH_TOP remains NOT_SELLABLE", () => {
    expect(STORES_SEARCH_TOP_LAUNCH.launchStatus).toBe("NOT_SELLABLE");
    expect(DELIVERY_AD_STAGE2_SURFACE_CONTRACT.searchTop).toBe("NOT_SELLABLE");
    expect(DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT.banner).not.toContain("STORES_SEARCH_TOP");
    expect(validateOwnerBannerInventory("STORES_SEARCH_TOP").ok).toBe(false);
  });

  it("S2-T17c before-rest Admin PUT realigns Stage 2 tail orders to avoid duplicate_order", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/admin/stores-home-before-rest-banner/route.ts"),
      "utf8"
    );
    expect(src).toContain("STAGE2_HOME_ORDER_REALIGN_SLOTS");
    expect(src).toContain("getCanonicalCompositionRows");
    expect(src).toContain("homeBannerBeforeRest");
    expect(src).toContain("slot6RestStores");
  });

  it("S2-T18/S2-T19 category + HOME native/banner controls are semantically separate", () => {
    expect(homePaidAdInsertionPolicyEnabled([...STORES_HOME_COMPOSITION_DEFAULT_POLICY])).toBe(
      false
    );
    expect(homeBannerBeforeRestPolicyEnabled([...STORES_HOME_COMPOSITION_DEFAULT_POLICY])).toBe(
      false
    );
    const enabledBanner = STORES_HOME_COMPOSITION_DEFAULT_POLICY.map((r) =>
      r.slot === "homeBannerBeforeRest" ? { ...r, enabled: true } : r
    );
    expect(homeBannerBeforeRestPolicyEnabled(enabledBanner)).toBe(true);
    expect(homePaidAdInsertionPolicyEnabled(enabledBanner)).toBe(false);
  });

  it("S2-T20 canonical Banner renderer reused", () => {
    expect(DELIVERY_AD_BANNER_RENDERER_CONTRACT.singleComponent).toBe("DeliveryAdBanner");
    expect(beforeRestSrc()).toContain("DeliveryAdBanner");
    expect(browseTopSrc()).toContain("DeliveryAdBanner");
  });

  it("S2-T21/S2-T22 sponsored/native + Banner advertising disclosure", () => {
    expect(beforeRestSrc()).toContain("store_insertion_sponsored");
    expect(browseTopSrc()).toContain("store_insertion_sponsored");
    expect(STAGE2_BANNER_CONTENT_MODEL.STORES_HOME_INLINE_1).toBe("IMAGE_ONLY");
  });

  it("S2-T23 Stage 1 finance authority unchanged", () => {
    expect(canonicalCashSrc()).toContain("AD_SPEND");
    expect(canonicalCashSrc()).toContain("AD_REFUND");
    expect(DELIVERY_AD_STAGE2_SURFACE_CONTRACT.stage1Finance).toBe("HARD_LOCKED");
  });

  it("S2-T24 legacy Business Cash not reactivated", () => {
    expect(DELIVERY_AD_STAGE2_SURFACE_CONTRACT.legacyBusinessCash).toBe("LEGACY_READ_ONLY");
  });

  it("Stage 2 physical order + labels + rejected slots + DB surfaces", () => {
    expect(STAGE2_HOME_PHYSICAL_ORDER).toContain("HOME_BEFORE_REST_banner");
    expect(STAGE2_BROWSE_PHYSICAL_ORDER).toContain("BROWSE_TOP_banner");
    expect(STAGE2_HUMAN_LABELS_KO.STORES_HOME_INLINE_1).toContain("배너");
    expect(STAGE2_REJECTED_PHYSICAL_SLOTS.some((r) => r.candidate === "STORES_SEARCH_TOP")).toBe(
      true
    );
    expect(isRuntimeActiveInventory("STORES_HOME_INLINE_1")).toBe(true);
    expect(isRuntimeActiveInventory("STORES_CATEGORY_TOP")).toBe(true);
    expect(isRuntimeActiveInventory("STORES_CATEGORY_INLINE")).toBe(false);
    expect(INVENTORY_KEY_TO_BANNER_DB_SURFACE.STORES_HOME_INLINE_1).toBe("stores_home_inline");
    expect(INVENTORY_KEY_TO_BANNER_DB_SURFACE.STORES_CATEGORY_TOP).toBe("stores_browse_top");
    expect(BANNER_AD_DB_SURFACES).toContain("stores_home_inline");
    expect(browseViewSrc()).toContain("StoresBrowseTopBanner");
  });
});
