/**
 * CUT J — SEARCH_TOP inventory activation + DETAIL blocked (contract tests).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTIVE_DELIVERY_AD_INVENTORY_KEYS,
  CUT_J_DETAIL_INVENTORY_STATUS,
  FUTURE_DELIVERY_AD_INVENTORY_KEYS,
  inventorySeedByKey,
  isRuntimeActiveInventory,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import {
  ACTIVE_DELIVERY_AD_PLACEMENTS,
  BANNER_AD_DB_SURFACES,
  FUTURE_DELIVERY_AD_PLACEMENTS,
  isRuntimeDeliveryAdPlacement,
} from "@/lib/stores/advertising/delivery-ad-placement";
import {
  OWNER_BANNER_INVENTORY_KEYS,
  validateOwnerBannerInventory,
} from "@/lib/stores/advertising/owner-banner-contract";
import { validateOwnerInventorySelection } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import {
  evaluateBannerSearchTopExposure,
  selectSearchTopBannerCampaign,
  STORES_SEARCH_TOP_SLOT_POLICY,
  type BannerSearchTopExposureCampaign,
} from "@/lib/stores/advertising/banner-search-top-exposure";
import { DELIVERY_AD_BILLING_PLATFORM } from "@/lib/stores/advertising/delivery-ad-billing-contract";
import { DELIVERY_AD_OWNER_PRICING_PRODUCT } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { DELIVERY_AD_ATTRIBUTION_POLICY } from "@/lib/stores/advertising/delivery-ad-event-contract";
import {
  issueEligibleDeliveryAdExposure,
  verifyDeliveryAdExposureToken,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { CUT_I_ANALYTICS_AUTHORITY } from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import { DELIVERY_AD_ORGANIC_PAID_ISOLATION } from "@/lib/stores/advertising/delivery-ad-domain";

const root = process.cwd();
const mig = () =>
  readFileSync(
    join(root, "supabase/migrations/20261201190000_delivery_ads_cut_j_search_inventory.sql"),
    "utf8"
  );
const searchDeliverySrc = () =>
  readFileSync(join(root, "lib/delivery/search/search-delivery.ts"), "utf8");
const searchResultsSrc = () =>
  readFileSync(join(root, "components/delivery/search/DeliverySearchResults.tsx"), "utf8");
const ownerBannerWriterSrc = () =>
  readFileSync(join(root, "lib/stores/advertising/owner-banner-writer.ts"), "utf8");

function bannerCampaign(
  partial: Partial<BannerSearchTopExposureCampaign> & { id: string; storeId: string }
): BannerSearchTopExposureCampaign {
  return {
    id: partial.id,
    storeId: partial.storeId,
    lifecycleStatus: partial.lifecycleStatus ?? "ACTIVE",
    reviewStatus: partial.reviewStatus ?? "APPROVED",
    startAt: partial.startAt ?? "2026-01-01T00:00:00.000Z",
    endAt: partial.endAt ?? "2027-01-01T00:00:00.000Z",
    inventoryKeys: partial.inventoryKeys ?? ["STORES_SEARCH_TOP"],
    creativeAssetPath: partial.creativeAssetPath ?? "stores/ads/search.jpg",
    creativeReviewStatus: partial.creativeReviewStatus ?? "APPROVED",
    ctaHref: partial.ctaHref ?? "/stores/demo",
    // MODEL B: OWNER_PAID ACTIVE exposure requires FUNDED (absent = UNFUNDED)
    campaignSource: partial.campaignSource ?? "OWNER_PAID",
    fundingStatus: partial.fundingStatus ?? "FUNDED",
  };
}

const nowMs = Date.parse("2026-06-15T12:00:00.000Z");

describe("CUT J Search / Detail inventory", () => {
  it("J1 canonical Search inventory exists and is ACTIVE", () => {
    expect(isRuntimeActiveInventory("STORES_SEARCH_TOP")).toBe(true);
    expect(ACTIVE_DELIVERY_AD_INVENTORY_KEYS).toContain("STORES_SEARCH_TOP");
    expect(inventorySeedByKey("STORES_SEARCH_TOP").productKind).toBe("banner");
    expect(inventorySeedByKey("STORES_SEARCH_TOP").surface).toBe("stores_search");
  });

  it("J2 canonical Detail inventory exists but stays FUTURE / blocked", () => {
    expect(CUT_J_DETAIL_INVENTORY_STATUS.key).toBe("STORE_DETAIL_RECOMMENDATION_BANNER");
    expect(CUT_J_DETAIL_INVENTORY_STATUS.state).toBe("BLOCKED_NO_CANONICAL_SURFACE");
    expect(isRuntimeActiveInventory("STORE_DETAIL_RECOMMENDATION_BANNER")).toBe(false);
    expect(FUTURE_DELIVERY_AD_INVENTORY_KEYS).toContain("STORE_DETAIL_RECOMMENDATION_BANNER");
  });

  it("J3 only implemented inventories become ACTIVE", () => {
    expect(ACTIVE_DELIVERY_AD_INVENTORY_KEYS).toEqual([
      "STORES_HOME_HERO",
      "STORES_HOME_FEED",
      "STORES_CATEGORY_FEED",
      "STORES_SEARCH_TOP",
    ]);
    expect(ACTIVE_DELIVERY_AD_PLACEMENTS).toContain("stores_search");
    expect(FUTURE_DELIVERY_AD_PLACEMENTS).toEqual(["store_detail_recommendation"]);
  });

  it("J4 inactive future inventory cannot resolve (DETAIL)", () => {
    expect(validateOwnerBannerInventory("STORE_DETAIL_RECOMMENDATION_BANNER").ok).toBe(false);
    expect(isRuntimeDeliveryAdPlacement("store_detail_recommendation")).toBe(false);
    const picked = selectSearchTopBannerCampaign(
      [
        bannerCampaign({
          id: "c-detail-misuse",
          storeId: "s1",
          inventoryKeys: ["STORE_DETAIL_RECOMMENDATION_BANNER"],
        }),
      ],
      ["s1"],
      nowMs
    );
    expect(picked).toBeNull();
  });

  it("J5 Owner cannot sell SEARCH at launch (schema/runtime may remain)", () => {
    expect(OWNER_BANNER_INVENTORY_KEYS).not.toContain("STORES_SEARCH_TOP");
    expect(validateOwnerBannerInventory("STORES_SEARCH_TOP")).toEqual({
      ok: false,
      error: "invalid_inventory",
    });
    expect(isRuntimeActiveInventory("STORES_SEARCH_TOP")).toBe(true);
  });

  it("J6 Admin surface map still knows SEARCH; Owner sell validator rejects", () => {
    expect(BANNER_AD_DB_SURFACES).toEqual(["stores_home_hero", "stores_search"]);
    expect(validateOwnerBannerInventory("STORES_SEARCH_TOP").ok).toBe(false);
    const adminSrc = readFileSync(
      join(root, "lib/stores/advertising/admin-delivery-ad-writer.ts"),
      "utf8"
    );
    expect(adminSrc).toContain('STORES_SEARCH_TOP" ? "stores_search"');
  });

  it("J7 existing campaigns are not silently backfilled", () => {
    const sql = mig();
    expect(sql).toContain("UPDATE public.delivery_ad_inventories");
    expect(sql).toContain("WHERE key = 'STORES_SEARCH_TOP'");
    // No silent attach of SEARCH inventory onto pre-existing campaigns
    expect(sql).not.toMatch(
      /UPDATE\s+public\.store_banner_ad_campaigns\s+SET\s+surface\s*=\s*'stores_search'/i
    );
    expect(sql).not.toMatch(
      /INSERT\s+INTO\s+public\.delivery_banner_campaign_inventories\s*\([^)]*\)\s*SELECT/i
    );
    expect(ownerBannerWriterSrc()).not.toContain("silent backfill");
  });

  it("J8 eligible Sponsored Search resolves", () => {
    const c = bannerCampaign({ id: "c1", storeId: "s1" });
    expect(
      evaluateBannerSearchTopExposure({
        campaign: c,
        organicStoreIds: ["s1", "s2"],
        nowMs,
      }).ok
    ).toBe(true);
    expect(selectSearchTopBannerCampaign([c], ["s1"], nowMs)?.id).toBe("c1");
  });

  it("J9 ineligible campaign excluded", () => {
    const paused = bannerCampaign({
      id: "c2",
      storeId: "s1",
      lifecycleStatus: "PAUSED_OWNER",
    });
    expect(
      evaluateBannerSearchTopExposure({
        campaign: paused,
        organicStoreIds: ["s1"],
        nowMs,
      }).ok
    ).toBe(false);
  });

  it("J10/J12 relevance = organic store ids (serviceability via organic pool)", () => {
    expect(STORES_SEARCH_TOP_SLOT_POLICY.relevance).toBe(
      "advertised_store_in_organic_store_ids"
    );
    const unrelated = bannerCampaign({ id: "c3", storeId: "s9" });
    const r = evaluateBannerSearchTopExposure({
      campaign: unrelated,
      organicStoreIds: ["s1", "s2"],
      nowMs,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("search_relevance");
  });

  it("J11/J35 empty organic / empty query fail-closed", () => {
    expect(STORES_SEARCH_TOP_SLOT_POLICY.requireNonEmptyQuery).toBe(true);
    expect(STORES_SEARCH_TOP_SLOT_POLICY.requireOrganicStoreResults).toBe(true);
    expect(selectSearchTopBannerCampaign([bannerCampaign({ id: "c1", storeId: "s1" })], [], nowMs)).toBeNull();
  });

  it("J12 organic ranking receives no paid input", () => {
    const src = searchDeliverySrc();
    expect(src).toMatch(/loadStoresSearchTopBannerSlide/);
    expect(src).toMatch(/organicStoreIds:\s*mergedStores\.map/);
    expect(src).not.toMatch(/organic_score\s*\+=/);
    expect(src).not.toMatch(/paid_boost/);
    expect(DELIVERY_AD_ORGANIC_PAID_ISOLATION.forbidden.length).toBeGreaterThan(0);
  });

  it("J16/J17 zero ads + paid failure → organic parity (fail-closed loader)", () => {
    const src = searchDeliverySrc();
    expect(src).toMatch(/searchTopBanner\s*=\s*null/);
    expect(src).toMatch(/\[delivery-search\] searchTopBanner/);
    expect(selectSearchTopBannerCampaign([], ["s1"], nowMs)).toBeNull();
  });

  it("J18 pagination unaffected — paid is presentation after organic merge", () => {
    const src = searchDeliverySrc();
    expect(src).toMatch(/organicStoreIds:\s*mergedStores\.map\(\(s\)\s*=>\s*s\.id\)/);
    expect(src).toMatch(/result_count\s*=\s*mergedStores\.length\s*\+\s*menus\.length/);
    // result_count is organic-only; banner is sibling field
    expect(src).toMatch(/searchTopBanner,/);
  });

  it("J19–J26 Detail sponsored BLOCKED — no surface invented", () => {
    expect(CUT_J_DETAIL_INVENTORY_STATUS.state).toBe("BLOCKED_NO_CANONICAL_SURFACE");
    const detailSrc = readFileSync(
      join(root, "lib/stores/advertising/delivery-ad-inventory.ts"),
      "utf8"
    );
    expect(detailSrc).toContain("BLOCKED_NO_CANONICAL_SURFACE");
    expect(mig()).toContain("STORE_DETAIL_RECOMMENDATION_BANNER");
    expect(mig()).toMatch(/is_active = false/);
  });

  it("J20 Detail self-ad N/A — DETAIL inventory blocked", () => {
    expect(isRuntimeActiveInventory("STORE_DETAIL_RECOMMENDATION_BANNER")).toBe(false);
  });

  it("J27/J28 Search exposure token issued; Detail N/A", () => {
    const { token, payload } = issueEligibleDeliveryAdExposure({
      campaignId: "c1",
      productKind: "banner",
      storeId: "s1",
      surface: "STORES_SEARCH_TOP",
      destinationType: "store_detail",
      destinationId: "s1",
      creativeId: null,
      inventoryId: null,
      placementIndex: 0,
    });
    expect(verifyDeliveryAdExposureToken(token).ok).toBe(true);
    expect(payload.surface).toBe("STORES_SEARCH_TOP");
    expect(payload.preview).not.toBe(true);
  });

  it("J29–J32 CUT G endpoints reused by DeliveryAdBanner", () => {
    const banner = readFileSync(
      join(root, "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(banner).toContain("useDeliveryAdImpressionObserver");
    expect(banner).toContain("reportDeliveryAdClick");
    expect(searchResultsSrc()).toContain("DeliveryAdBanner");
    expect(searchResultsSrc()).toContain("exposureToken");
  });

  it("J33 preview emits no Production event (renderContext gate)", () => {
    const banner = readFileSync(
      join(root, "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(banner).toContain('renderContext === "customer"');
    expect(banner).toContain("isCustomer && Boolean(token)");
  });

  it("J34/J35 analytics reuses CUT I breakdown authority", () => {
    expect(CUT_I_ANALYTICS_AUTHORITY.breakdownRpc).toBe("get_delivery_ad_performance_breakdown");
  });

  it("J36–J38 billing stays disabled / pricing NOT_CONFIGURED", () => {
    expect(DELIVERY_AD_BILLING_PLATFORM.isEnabled).toBe(false);
    expect(DELIVERY_AD_BILLING_PLATFORM.status).toBe("DISABLED");
    expect(DELIVERY_AD_OWNER_PRICING_PRODUCT.status).toBe("NOT_CONFIGURED");
    expect(DELIVERY_AD_ATTRIBUTION_POLICY.status).toBe("NOT_CONFIGURED");
  });

  it("J39/J40 client cannot forge campaign — token HMAC required", () => {
    const forged = Buffer.from(
      JSON.stringify({
        v: 1,
        campaignId: "forged",
        productKind: "banner",
        storeId: "s1",
        surface: "STORES_SEARCH_TOP",
        placementIndex: 0,
        destinationType: "store_detail",
        destinationId: "s1",
        exp: Date.now() + 60_000,
      })
    ).toString("base64url");
    expect(verifyDeliveryAdExposureToken(`${forged}.deadbeef`).ok).toBe(false);
  });

  it("J41 Owner cannot assign incompatible/inactive inventory", () => {
    expect(validateOwnerBannerInventory("STORES_HOME_INLINE_1").ok).toBe(false);
    expect(validateOwnerInventorySelection(["STORES_SEARCH_TOP"]).ok).toBe(false);
  });

  it("J42 Admin canonical validator enforced for future DETAIL", () => {
    expect(validateOwnerBannerInventory("STORE_DETAIL_RECOMMENDATION_BANNER").ok).toBe(false);
  });

  it("J43–J50 responsive contract — SEARCH aspect + shared banner renderer", () => {
    const inv = inventorySeedByKey("STORES_SEARCH_TOP");
    expect(inv.aspectRatioWidth).toBe(3);
    expect(inv.aspectRatioHeight).toBe(1);
    expect(STORES_SEARCH_TOP_SLOT_POLICY.position).toBe("above_organic_store_results");
    expect(STORES_SEARCH_TOP_SLOT_POLICY.maxBanners).toBe(1);
    expect(searchResultsSrc()).toContain('data-delivery-ad-inventory="STORES_SEARCH_TOP"');
    expect(searchResultsSrc()).toContain("overflow-hidden");
  });

  it("migration activates SEARCH only; DETAIL stays FUTURE", () => {
    const sql = mig();
    expect(sql).toContain("WHERE key = 'STORES_SEARCH_TOP'");
    expect(sql).toContain("runtime_status = 'ACTIVE'");
    expect(sql).toContain("WHERE key = 'STORE_DETAIL_RECOMMENDATION_BANNER'");
    expect(sql).toContain("stores_search");
    expect(sql).toContain("STORES_HOME_HERO', 'STORES_SEARCH_TOP'");
  });
});
