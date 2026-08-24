import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EDITORIAL_PROMOTION_BROWSE_INSERTION_ALLOWED,
  EDITORIAL_PROMOTION_BROWSE_RANK_OVERRIDE_ALLOWED,
  EDITORIAL_PROMOTION_CAMPAIGN_TABLE,
  assertEditorialPromotionDomainSeparation,
  isEditorialPromotionCampaignActive,
  selectEditorialPromotionsForHome,
  storeHasDeliveryFeeBenefitEvidence,
  storeHasEditorialPromotionMembership,
  STORES_DISCOVERY_DOMAIN_TABLE_SEPARATION,
} from "@/lib/stores/store-editorial-promotion";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";
import { canonicalizeHomeShelfId } from "@/lib/stores/product/stores-home-shelf-product-catalog";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  buildBrowseCategoryPromoLine,
  buildBrowseDeliveryFeeBenefitLine,
} from "@/lib/stores/build-browse-category-promo-line";

const nowMs = Date.parse("2026-06-15T12:00:00.000Z");

function item(partial: Partial<StoreHomeFeedItem> & { id: string }): StoreHomeFeedItem {
  return {
    id: partial.id,
    slug: partial.slug ?? partial.id,
    nameKo: partial.nameKo ?? partial.id,
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
    regionLabel: "Manila",
    status: partial.status ?? "closed",
    rating: partial.rating ?? 3,
    reviewCount: partial.reviewCount ?? 0,
    deliveryAvailable: partial.deliveryAvailable ?? true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: 15,
    etaLabel: partial.etaLabel ?? "약 25~35분",
    deliveryFeeLabel: partial.deliveryFeeLabel ?? null,
    deliveryFeeStrikePhp: partial.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: "",
    distanceKm: partial.distanceKm ?? null,
    featuredItems: partial.featuredItems ?? [
      { productId: `p-${partial.id}`, name: "m", price: 100, imageUrl: null },
    ],
    platformPopularProducts: partial.platformPopularProducts,
    profileImageUrl: null,
    isFeatured: partial.isFeatured ?? false,
    commerce: {
      minOrderPhp: null,
      deliveryFeePhp: null,
      freeDeliveryOverPhp: null,
      deliveryCourierLabel: null,
      deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null,
      prepMinutes: 20,
      estPrepLabel: "20분",
      deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null,
      paymentMethodsConfig: null,
    },
    completedOrderCount30d: partial.completedOrderCount30d ?? 0,
    discoveryEligibilityRank: partial.discoveryEligibilityRank,
    firstListedAt: partial.firstListedAt ?? null,
    discoveryCampaign: partial.discoveryCampaign,
  };
}

describe("CUT 7 promotions domain SSOT", () => {
  it("T1 editorial promotion authority = store_discovery_campaigns", () => {
    expect(EDITORIAL_PROMOTION_CAMPAIGN_TABLE).toBe("store_discovery_campaigns");
    expect(assertEditorialPromotionDomainSeparation()).toBe(true);
  });

  it("T2 active campaign visible in editorial_promo", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "camp",
        discoveryCampaign: {
          id: "c1",
          campaignType: "promo",
          title: "이벤트",
          bodyCopy: null,
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-07-01T00:00:00.000Z",
        },
      }),
      item({ id: "plain" }),
    ]);
    expect(composition.campaignFood.map((e) => e.storeId)).toEqual(["camp"]);
    expect(storeHasEditorialPromotionMembership({ discoveryCampaign: { id: "c1" } })).toBe(true);
  });

  it("T3 inactive campaign excluded", () => {
    const map = selectEditorialPromotionsForHome(
      [
        {
          id: "c1",
          storeId: "s1",
          campaignType: "event",
          title: "x",
          bodyCopy: null,
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-07-01T00:00:00.000Z",
          isActive: false,
        },
      ],
      ["s1"],
      nowMs
    );
    expect(map.size).toBe(0);
  });

  it("T4 future/expired campaign excluded", () => {
    expect(
      isEditorialPromotionCampaignActive(
        {
          isActive: true,
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: "2026-09-01T00:00:00.000Z",
        },
        nowMs
      )
    ).toBe(false);
    expect(
      isEditorialPromotionCampaignActive(
        {
          isActive: true,
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: "2026-02-01T00:00:00.000Z",
        },
        nowMs
      )
    ).toBe(false);
  });

  it("T5 campaign-store relation canonical", () => {
    const map = selectEditorialPromotionsForHome(
      [
        {
          id: "c1",
          storeId: "s1",
          campaignType: "promo",
          title: "a",
          bodyCopy: null,
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-07-01T00:00:00.000Z",
          isActive: true,
        },
        {
          id: "c2",
          storeId: "s2",
          campaignType: "event",
          title: "b",
          bodyCopy: null,
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-07-01T00:00:00.000Z",
          isActive: true,
        },
      ],
      ["s1"],
      nowMs
    );
    expect([...map.keys()]).toEqual(["s1"]);
    expect(map.get("s1")?.id).toBe("c1");
  });

  it("T6 editorial does not change HOME unrelated shelves", () => {
    /** Campaign store uses distinct product so Invariant C does not starve editorial. */
    const storesWith = [
      item({
        id: "camp",
        featuredItems: [{ productId: "p-camp", name: "캠페인", price: 100, imageUrl: null }],
        discoveryCampaign: {
          id: "c1",
          campaignType: "promo",
          title: "프로모",
          bodyCopy: null,
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-07-01T00:00:00.000Z",
        },
      }),
      item({ id: "fee", deliveryFeeStrikePhp: 30 }),
    ];
    const storesWithout = storesWith.map((s) =>
      s.id === "camp" ? { ...s, discoveryCampaign: undefined } : s
    );
    const withCamp = composeStoresHomeFeed(storesWith);
    const without = composeStoresHomeFeed(storesWithout);
    expect(withCamp.slot3Food.map((e) => e.storeId)).toEqual(without.slot3Food.map((e) => e.storeId));
    expect(withCamp.campaignFood.map((e) => e.storeId)).toEqual(["camp"]);
    expect(without.campaignFood).toEqual([]);
    /** Editorial card must not carry fee evidence. */
    expect(withCamp.campaignFood[0]?.deliveryFeeStrikePhp).toBeNull();
    expect(withCamp.campaignFood[0]?.discountEvidence).toBeNull();
  });

  it("T7 editorial does not change BROWSE organic ranking", () => {
    expect(EDITORIAL_PROMOTION_BROWSE_RANK_OVERRIDE_ALLOWED).toBe(false);
    const browseBuild = readFileSync(join(process.cwd(), "lib/stores/stores-browse-build.ts"), "utf8");
    expect(browseBuild).not.toMatch(/store_discovery_campaigns|discoveryCampaign/);
  });

  it("T8 editorial BROWSE insertion = none", () => {
    expect(EDITORIAL_PROMOTION_BROWSE_INSERTION_ALLOWED).toBe(false);
    const browseInsertion = readFileSync(
      join(process.cwd(), "lib/stores/composition/stores-composition-browse-insertion-meta.ts"),
      "utf8"
    );
    expect(browseInsertion).not.toMatch(/store_discovery_campaigns|discoveryCampaign|editorial/);
  });

  it("T9 delivery_fee_benefit requires fee evidence", () => {
    expect(storeHasDeliveryFeeBenefitEvidence({ deliveryFeeStrikePhp: 40 })).toBe(true);
    expect(storeHasDeliveryFeeBenefitEvidence({ deliveryFeeStrikePhp: 0 })).toBe(false);
    expect(storeHasDeliveryFeeBenefitEvidence({ deliveryFeeStrikePhp: null })).toBe(false);
    const composition = composeStoresHomeFeed([
      item({ id: "strike", deliveryFeeStrikePhp: 40 }),
      item({ id: "zero", deliveryFeeStrikePhp: 0 }),
      item({ id: "none", deliveryFeeStrikePhp: null }),
    ]);
    expect(composition.slot3Food.map((e) => e.storeId)).toEqual(["strike"]);
  });

  it("T10 delivery fee benefit independent from editorial campaign", () => {
    const feeOnly = composeStoresHomeFeed([item({ id: "fee", deliveryFeeStrikePhp: 50 })]);
    const editorialOnly = composeStoresHomeFeed([
      item({
        id: "edit",
        featuredItems: [{ productId: "p-edit", name: "e", price: 1, imageUrl: null }],
        discoveryCampaign: {
          id: "c1",
          campaignType: "event",
          title: "e",
          bodyCopy: null,
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    ]);
    expect(feeOnly.slot3Food.map((e) => e.storeId)).toEqual(["fee"]);
    expect(feeOnly.campaignFood).toEqual([]);
    expect(editorialOnly.campaignFood.map((e) => e.storeId)).toEqual(["edit"]);
    expect(editorialOnly.slot3Food).toEqual([]);
    expect(STORES_DISCOVERY_DOMAIN_TABLE_SEPARATION.DELIVERY_FEE_BENEFIT).toBe(
      "deliveryFeeStrikePhp"
    );
  });

  it("T11 paid ad independent", () => {
    expect(STORE_PAID_AD_CAMPAIGN_TABLE).not.toBe(EDITORIAL_PROMOTION_CAMPAIGN_TABLE);
  });

  it("T12 banner independent", () => {
    expect(STORE_BANNER_AD_CAMPAIGN_TABLE).not.toBe(EDITORIAL_PROMOTION_CAMPAIGN_TABLE);
  });

  it("T13 coupon independent", () => {
    expect(STORE_COUPON_CAMPAIGN_TABLE).not.toBe(EDITORIAL_PROMOTION_CAMPAIGN_TABLE);
  });

  it("T14 promo_campaign legacy is alias/mapping only", () => {
    expect(canonicalizeHomeShelfId("promo_campaign")).toBe("editorial_promo");
    const catalog = readFileSync(
      join(process.cwd(), "lib/stores/product/stores-home-shelf-product-catalog.ts"),
      "utf8"
    );
    expect(catalog).toMatch(/shelfId: "editorial_promo"/);
    expect(catalog).not.toMatch(/shelfId: "promo_campaign"/);
  });

  it("T15 canonical decoration labels separated", () => {
    expect(buildBrowseDeliveryFeeBenefitLine).toBe(buildBrowseCategoryPromoLine);
    const feeLineSrc = readFileSync(
      join(process.cwd(), "lib/stores/build-browse-category-promo-line.ts"),
      "utf8"
    );
    expect(feeLineSrc).toMatch(/DELIVERY_FEE_BENEFIT|fee authority/);
    expect(feeLineSrc).toMatch(/Does not read store_discovery_campaigns/);
    expect(feeLineSrc).toMatch(/Never sourced from EDITORIAL_PROMOTION/);
    expect(feeLineSrc).not.toMatch(/from\(["']@\/lib\/stores\/store-discovery/);
  });
});
