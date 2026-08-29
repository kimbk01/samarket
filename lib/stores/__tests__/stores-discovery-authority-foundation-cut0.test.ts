/**
 * CUT 0 — Authority foundation contract tests only.
 * No runtime HOME/BROWSE/paid-ad/coupon wiring.
 */

import { describe, expect, it } from "vitest";
import {
  BANNER_AD,
  BROWSE_SCOPE_POLICY,
  COUPON,
  COUPON_BADGE_ALLOWED,
  COUPON_CAMPAIGN,
  DELIVERY_FEE_BENEFIT,
  EDITORIAL_PROMOTION,
  PRIMARY_INDUSTRY,
  SECONDARY_INDUSTRY,
  STORE_DISCOVERY_CAMPAIGNS_MEANING,
  STORE_PAID_AD,
  STORES_DISCOVERY_AUTHORITY_FOUNDATION_CUT,
  STORES_DISCOVERY_BANNER_AD_ALLOWED_SURFACES,
  STORES_DISCOVERY_CURRENT_TO_TARGET_MAP,
  STORES_DISCOVERY_DOMAINS,
  STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES,
  STORES_DISCOVERY_HOME_SECTION_CONTRACTS,
  STORES_DISCOVERY_HOME_SECTION_IDS,
  STORES_DISCOVERY_MAP_STATES,
  STORES_DISCOVERY_MONETIZATION_KINDS,
  STORES_DISCOVERY_PAID_AD_ALLOWED_SURFACES,
  STORES_DISCOVERY_PAID_AD_EXPOSURE_FACTOR_KEYS,
  STORES_DISCOVERY_SURFACES,
  STORES_DISCOVERY_TAXONOMY_TABLE_OWNERS,
  TAXONOMY_NEQ_BROWSE_SCOPE_POLICY,
  deriveStoresDiscoveryPaidAdExposureState,
  homeSectionContractById,
  isBannerAdKind,
  isStorePaidAdKind,
  isStoresDiscoveryDomain,
  isStoresDiscoveryHomeSectionId,
  isStoresDiscoverySurface,
  storesDiscoveryMapRowByCurrent,
  storesDiscoveryMapRowsByLaterCut,
} from "@/lib/stores/discovery-authority";

describe("CUT 0 stores discovery authority foundation", () => {
  it("locks foundation cut marker at 0", () => {
    expect(STORES_DISCOVERY_AUTHORITY_FOUNDATION_CUT).toBe(0);
  });

  it("keeps domain list unique and TARGET-complete", () => {
    expect(new Set(STORES_DISCOVERY_DOMAINS).size).toBe(STORES_DISCOVERY_DOMAINS.length);
    expect(STORES_DISCOVERY_DOMAINS).toEqual([
      "TAXONOMY",
      "HOME_COMPOSITION",
      "BROWSE_DISCOVERY",
      "STORE_CARD",
      "STORE_PAID_AD",
      "BANNER_AD",
      "COUPON",
      "EDITORIAL_PROMOTION",
      "ADMIN_CONTROL_PLANE",
    ]);
    expect(isStoresDiscoveryDomain("TAXONOMY")).toBe(true);
    expect(isStoresDiscoveryDomain("promotion")).toBe(false);
  });

  it("keeps canonical HOME section ids unique and excludes paid insertion", () => {
    expect(new Set(STORES_DISCOVERY_HOME_SECTION_IDS).size).toBe(
      STORES_DISCOVERY_HOME_SECTION_IDS.length
    );
    expect(STORES_DISCOVERY_HOME_SECTION_IDS).toEqual([
      "industry_entry",
      "hero_banner",
      "order_now",
      "recommended",
      "popular_menu",
      "new_store",
      "editorial_promo",
      "delivery_fee_benefit",
      "high_rating",
      "rest_stores",
    ]);
    expect(isStoresDiscoveryHomeSectionId("main_stores")).toBe(false);
    expect(isStoresDiscoveryHomeSectionId("homePaidAdInsertion")).toBe(false);
    expect(STORES_DISCOVERY_HOME_SECTION_IDS).not.toContain("main_stores");
    expect(STORES_DISCOVERY_HOME_SECTION_IDS).not.toContain("fast_arrival");
  });

  it("defines one contract per canonical section with required concerns", () => {
    expect(STORES_DISCOVERY_HOME_SECTION_CONTRACTS).toHaveLength(
      STORES_DISCOVERY_HOME_SECTION_IDS.length
    );
    const ids = STORES_DISCOVERY_HOME_SECTION_CONTRACTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of STORES_DISCOVERY_HOME_SECTION_IDS) {
      const c = homeSectionContractById(id);
      expect(c.id).toBe(id);
      expect(c.entity).toBeTruthy();
      expect(c.candidateOwner).toBeTruthy();
      expect(c.membershipOwner).toBeTruthy();
      expect(c.rankingOwner).toBeTruthy();
      expect(c.presentation).toBeTruthy();
      expect(c.paidAdPolicy === "forbidden" || c.paidAdPolicy === "allowed_as_insertion").toBe(
        true
      );
      expect(
        c.couponPolicy === "forbidden" || c.couponPolicy === "badge_if_checkout_eligible"
      ).toBe(true);
      expect(c.fallback).toBe("hide_section");
      expect(Array.isArray(c.adminControl)).toBe(true);
    }
    expect(homeSectionContractById("rest_stores").paidAdPolicy).toBe("allowed_as_insertion");
    expect(homeSectionContractById("order_now").paidAdPolicy).toBe("forbidden");
  });

  it("locks legacy shelf states without promoting them to canonical", () => {
    expect(STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES.main_stores).toBe("REMOVED_CUT2");
    expect(STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES.fast_arrival).toBe("DEFERRED");
    expect(STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES.praise_reviews).toBe("UNAVAILABLE");
    expect(STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES.queue_popular).toBe("UNAVAILABLE");
    expect(STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES.timesale_countdown).toBe("UNAVAILABLE");
  });

  it("separates taxonomy terms from browse scope policy", () => {
    expect(PRIMARY_INDUSTRY).not.toBe(BROWSE_SCOPE_POLICY);
    expect(SECONDARY_INDUSTRY).not.toBe(BROWSE_SCOPE_POLICY);
    expect(TAXONOMY_NEQ_BROWSE_SCOPE_POLICY).toBe(true);
    expect(STORES_DISCOVERY_TAXONOMY_TABLE_OWNERS.PRIMARY_INDUSTRY).toBe("store_categories");
    expect(STORES_DISCOVERY_TAXONOMY_TABLE_OWNERS.SECONDARY_INDUSTRY).toBe("store_topics");
    expect(STORES_DISCOVERY_TAXONOMY_TABLE_OWNERS.BROWSE_SCOPE_POLICY).toBe(
      "store_browse_scope_policy"
    );
  });

  it("keeps surfaces unique and paid≠banner placement sets disjoint", () => {
    expect(new Set(STORES_DISCOVERY_SURFACES).size).toBe(STORES_DISCOVERY_SURFACES.length);
    expect(isStoresDiscoverySurface("stores_home_rest")).toBe(true);
    expect(isStoresDiscoverySurface("home")).toBe(false);
    // Widen to string Set so paid≠banner surface disjointness can be checked
    // without collapsing Banner's stores_home_hero into the paid placement union.
    const paid = new Set<string>(STORES_DISCOVERY_PAID_AD_ALLOWED_SURFACES);
    const banner = new Set<string>(STORES_DISCOVERY_BANNER_AD_ALLOWED_SURFACES);
    for (const s of paid) {
      expect(banner.has(s)).toBe(false);
    }
    expect(STORES_DISCOVERY_PAID_AD_ALLOWED_SURFACES).toEqual([
      "stores_home_rest",
      "stores_browse",
    ]);
    expect(STORES_DISCOVERY_BANNER_AD_ALLOWED_SURFACES).toEqual(["stores_home_hero"]);
  });

  it("separates STORE_PAID_AD, BANNER_AD, COUPON, fee, editorial", () => {
    expect(STORES_DISCOVERY_MONETIZATION_KINDS).toEqual([
      STORE_PAID_AD,
      BANNER_AD,
      COUPON,
      DELIVERY_FEE_BENEFIT,
      EDITORIAL_PROMOTION,
    ]);
    expect(isStorePaidAdKind(STORE_PAID_AD)).toBe(true);
    expect(isStorePaidAdKind(BANNER_AD)).toBe(false);
    expect(isBannerAdKind(BANNER_AD)).toBe(true);
    expect(isBannerAdKind(STORE_PAID_AD)).toBe(false);
    expect(STORE_DISCOVERY_CAMPAIGNS_MEANING).toBe(EDITORIAL_PROMOTION);
    expect(COUPON_CAMPAIGN).toBe("COUPON_CAMPAIGN");
    expect(COUPON_BADGE_ALLOWED).toBe("couponBadgeAllowed");
    expect(COUPON_CAMPAIGN).not.toBe(COUPON_BADGE_ALLOWED);
  });

  it("derives paid-ad exposure state from six factors only", () => {
    expect(STORES_DISCOVERY_PAID_AD_EXPOSURE_FACTOR_KEYS).toEqual([
      "campaignActive",
      "windowActive",
      "storeEligible",
      "placementMatched",
      "taxonomyScopeMatched",
      "surfaceAllowed",
    ]);
    const allOn = deriveStoresDiscoveryPaidAdExposureState({
      campaignActive: true,
      windowActive: true,
      storeEligible: true,
      placementMatched: true,
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(allOn.actualExposureEligible).toBe(true);
    expect(allOn.blockingReasons).toEqual([]);

    const blocked = deriveStoresDiscoveryPaidAdExposureState({
      campaignActive: true,
      windowActive: true,
      storeEligible: true,
      placementMatched: true,
      taxonomyScopeMatched: true,
      surfaceAllowed: false,
    });
    expect(blocked.actualExposureEligible).toBe(false);
    expect(blocked.blockingReasons).toEqual(["surfaceAllowed"]);
  });

  it("maps current → target with allowed states and mapping_only CUT 0 changes", () => {
    expect(STORES_DISCOVERY_MAP_STATES).toEqual([
      "CANONICAL",
      "LEGACY",
      "DEPRECATED",
      "DEFERRED",
      "UNAVAILABLE",
      "REMOVE_IN_LATER_CUT",
      "REMOVED",
    ]);
    for (const row of STORES_DISCOVERY_CURRENT_TO_TARGET_MAP) {
      expect(STORES_DISCOVERY_MAP_STATES).toContain(row.state);
      if (row.state === "REMOVED") {
        expect(row.changeInThisCut).toBe("removed");
      } else {
        expect(row.changeInThisCut).toBe("mapping_only");
      }
      expect(row.current.length).toBeGreaterThan(0);
      expect(row.canonical.length).toBeGreaterThan(0);
    }

    expect(storesDiscoveryMapRowByCurrent("STORES_HOME_HERO_SLIDES")?.state).toBe("REMOVED");
    expect(storesDiscoveryMapRowByCurrent("main_stores")?.canonical).toBe("rest_stores");
    expect(storesDiscoveryMapRowByCurrent("main_stores")?.state).toBe("DEPRECATED");
    expect(storesDiscoveryMapRowByCurrent("promo_campaign")?.canonical).toBe("editorial_promo");
    expect(storesDiscoveryMapRowByCurrent("popular")?.canonical).toBe("popular_menu");
    expect(storesDiscoveryMapRowByCurrent("store_discovery_campaigns")?.canonical).toBe(
      "EDITORIAL_PROMOTION"
    );
    expect(storesDiscoveryMapRowByCurrent("BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER")?.laterCut).toBe(
      "CUT_1"
    );

    expect(storesDiscoveryMapRowsByLaterCut("CUT_1").length).toBeGreaterThan(0);
    expect(storesDiscoveryMapRowsByLaterCut("CUT_3").length).toBeGreaterThan(0);
    expect(storesDiscoveryMapRowsByLaterCut("CUT_4").length).toBeGreaterThan(0);
  });
});
