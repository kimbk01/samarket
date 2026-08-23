import { describe, expect, it } from "vitest";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const NOW = Date.parse("2026-08-23T12:00:00.000Z");

function item(partial: Partial<StoreHomeFeedItem> & { id: string }): StoreHomeFeedItem {
  return {
    id: partial.id,
    slug: partial.slug ?? partial.id,
    nameKo: partial.nameKo ?? "매장",
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
    regionLabel: "Manila",
    status: partial.status ?? "open",
    rating: partial.rating ?? (partial.discoveryCampaign ? 3 : 4.5),
    reviewCount: partial.reviewCount ?? (partial.discoveryCampaign ? 0 : 10),
    deliveryAvailable: partial.deliveryAvailable ?? true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: 15,
    etaLabel: "약 25~35분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: partial.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: "",
    distanceKm: 1.2,
    featuredItems: partial.featuredItems ?? [
      { productId: `rep-${partial.id}`, name: "대표메뉴", price: 500 },
    ],
    platformPopularProducts: partial.platformPopularProducts,
    profileImageUrl: null,
    isFeatured: partial.isFeatured ?? false, // campaign fixtures keep false unless overridden
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

describe("composeStoresHomeFeed — P1-D B2 campaignFood", () => {
  it("T1 includes active campaign with owner representative product", () => {
    const composition = composeStoresHomeFeed(
      [
        item({
          id: "s1",
          status: "closed",
          featuredItems: [{ productId: "owner-1", name: "오너추천", price: 100 }],
          platformPopularProducts: [
            {
              productId: "pop-1",
              name: "인기",
              price: 90,
              imageUrl: null,
              totalQty: 9,
              popularRank: 1,
              windowDays: 30,
            },
          ],
          discoveryCampaign: {
            id: "c1",
            campaignType: "event",
            title: "여름 이벤트",
            bodyCopy: null,
            startAt: "2026-08-20T00:00:00.000Z",
            endAt: "2026-08-28T00:00:00.000Z",
          },
        }),
      ],
      { nowMs: NOW }
    );
    expect(composition.campaignFood).toHaveLength(1);
    expect(composition.campaignFood[0]?.productId).toBe("owner-1");
    expect(composition.campaignFood[0]?.menuAuthority).toBe("owner_representative");
    expect(composition.campaignFood[0]?.campaignTitle).toBe("여름 이벤트");
    expect(composition.campaignFood[0]?.discountEvidence).toBeNull();
  });

  it("T7 store without campaign keeps prior shelves; campaignFood empty", () => {
    const composition = composeStoresHomeFeed(
      [
        item({
          id: "filler",
          status: "open",
          deliveryAvailable: true,
          featuredItems: [{ productId: "filler-p", name: "필러", price: 50 }],
        }),
        item({
          id: "plain-new",
          status: "closed",
          completedOrderCount30d: 0, // avoid Slot2 consuming representative before newStore
          rating: 3,
          reviewCount: 0,
          firstListedAt: new Date(NOW - 2 * 86400000).toISOString(),
          featuredItems: [{ productId: "plain-new-p", name: "신규", price: 80 }],
        }),
        item({
          id: "plain-strike",
          status: "closed",
          deliveryFeeStrikePhp: 40,
          featuredItems: [{ productId: "plain-strike-p", name: "할인", price: 70 }],
        }),
      ],
      { nowMs: NOW }
    );
    expect(composition.campaignFood).toEqual([]);
    expect(composition.slot3Food.map((e) => e.storeId)).toContain("plain-strike");
    expect(composition.newStoreFood.map((e) => e.storeId)).toContain("plain-new");
  });

  it("T9/T10/T11 Slot0–6 and Cut A Slot3 / P1-B Slot2 preserved with campaign present", () => {
    const stores = [
      item({
        id: "s-open",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 12,
        deliveryFeeStrikePhp: 30,
        platformPopularProducts: [
          {
            productId: "pop-1",
            name: "인기",
            price: 90,
            imageUrl: null,
            totalQty: 9,
            popularRank: 1,
            windowDays: 30,
          },
        ],
        isFeatured: true,
        rating: 4.8,
        reviewCount: 20,
      }),
      item({
        id: "s2",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 5,
        deliveryFeeStrikePhp: 20,
      }),
      // Invariant C: campaign-only store (closed / low rating) so Slot0–5 do not consume its product
      item({
        id: "s-camp",
        status: "closed",
        featuredItems: [{ productId: "camp-p", name: "캠페인메뉴", price: 70 }],
        discoveryCampaign: {
          id: "c1",
          campaignType: "promo",
          title: "프로모",
          bodyCopy: null,
          startAt: "2026-08-20T00:00:00.000Z",
          endAt: "2026-08-26T00:00:00.000Z",
        },
      }),
    ];
    const without = composeStoresHomeFeed(
      stores.map((s) => ({ ...s, discoveryCampaign: null })),
      { nowMs: NOW }
    );
    const withCamp = composeStoresHomeFeed(stores, { nowMs: NOW });

    expect(withCamp.slot0Food.map((e) => e.storeId)).toEqual(without.slot0Food.map((e) => e.storeId));
    expect(withCamp.slot1Stores.map((s) => s.id)).toEqual(without.slot1Stores.map((s) => s.id));
    expect(withCamp.slot2Food.map((e) => e.productId)).toEqual(without.slot2Food.map((e) => e.productId));
    expect(withCamp.slot2Food.some((e) => e.menuAuthority === "platform_popular")).toBe(true);
    expect(withCamp.slot3Food.map((e) => e.storeId)).toEqual(without.slot3Food.map((e) => e.storeId));
    expect(withCamp.slot4Food.map((e) => e.storeId)).toEqual(without.slot4Food.map((e) => e.storeId));
    expect(withCamp.slot5Food.map((e) => e.storeId)).toEqual(without.slot5Food.map((e) => e.storeId));
    expect(withCamp.campaignFood.map((e) => e.storeId)).toEqual(["s-camp"]);
  });

  it("T12/T13 campaign card is owner representative without fake popular/discount copy", () => {
    const composition = composeStoresHomeFeed(
      [
        item({
          id: "s1",
          status: "closed",
          deliveryFeeStrikePhp: null,
          featuredItems: [{ productId: "owner-9", name: "대표", price: 1 }],
          platformPopularProducts: [
            {
              productId: "pop-9",
              name: "인기메뉴",
              price: 2,
              imageUrl: null,
              totalQty: 3,
              popularRank: 1,
              windowDays: 30,
            },
          ],
          discoveryCampaign: {
            id: "c9",
            campaignType: "event",
            title: "캠페인 타이틀",
            bodyCopy: "본문",
            startAt: "2026-08-21T00:00:00.000Z",
            endAt: "2026-08-27T00:00:00.000Z",
          },
        }),
      ],
      { nowMs: NOW }
    );
    const card = composition.campaignFood[0]!;
    expect(card.productId).toBe("owner-9");
    expect(card.menuAuthority).toBe("owner_representative");
    expect(card.campaignTitle).toBe("캠페인 타이틀");
    expect(card.discountEvidence).toBeNull();
    expect(card.deliveryFeeStrikePhp).toBeNull();
  });

  it("orders campaign shelf by end_at ASC across stores", () => {
    const composition = composeStoresHomeFeed(
      [
        item({
          id: "later",
          status: "closed",
          discoveryCampaign: {
            id: "c-later",
            campaignType: "event",
            title: "늦음",
            bodyCopy: null,
            startAt: "2026-08-20T00:00:00.000Z",
            endAt: "2026-08-29T00:00:00.000Z",
          },
        }),
        item({
          id: "sooner",
          status: "closed",
          discoveryCampaign: {
            id: "c-soon",
            campaignType: "promo",
            title: "임박",
            bodyCopy: null,
            startAt: "2026-08-20T00:00:00.000Z",
            endAt: "2026-08-25T00:00:00.000Z",
          },
        }),
      ],
      { nowMs: NOW }
    );
    expect(composition.campaignFood.map((e) => e.storeId)).toEqual(["sooner", "later"]);
  });
});
