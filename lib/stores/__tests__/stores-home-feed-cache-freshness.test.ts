/**
 * DSC-02 — 주소 변경 후 배달 홈 클라 캐시가 이전 주소 기준 매장 집합을 fresh 로 유지하지 않음 /
 *          fresh 캐시 페인트 후 재검증 행이 다르면 교체 판정.
 * ADC-12 — 클라 캐시·live 스냅샷에는 스폰서드(유료) 행을 보관하지 않음.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/addresses/MandatoryAddressGate", () => ({
  SAMARKET_ADDRESSES_UPDATED_EVENT: "samarket:addresses-updated",
}));
vi.mock("@/lib/addresses/fetch-address-defaults-client", () => ({
  invalidateAddressDefaultsSnapshotCache: () => {},
}));
vi.mock("@/lib/addresses/address-list-client-cache", () => ({
  isMeAddressListCacheFresh: () => false,
  refreshMeAddressesListAfterMutation: async () => [],
}));

import { broadcastUserAddressesChanged } from "@/lib/addresses/user-addresses-sync";
import {
  primeStoreHomeFeedClientCache,
  readStoreHomeFeedClientCache,
} from "@/lib/stores/store-home-feed-client-cache";
import { storesHomeFeedRevalidatedStoresChanged } from "@/lib/stores/stores-home-feed-load-policy";
import {
  readStoresHomeFeedLiveStore,
  resetStoresHomeFeedLiveStoreForTests,
  writeStoresHomeFeedLiveStore,
} from "@/lib/stores/stores-home-feed-live-store";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";

function store(id: string, extra: Partial<StoreHomeFeedItem> = {}): StoreHomeFeedItem {
  return { id, slug: id, nameKo: id, distanceKm: null, ...extra } as StoreHomeFeedItem;
}

const insertionsWithAd: StoresHomeInsertionMeta = {
  paidAds: [
    { id: "camp-1", storeId: "s2", title: "Ad", headline: "Ad", bodyCopy: null, imageUrl: null, placement: "rest" },
  ],
  coupons: [
    {
      id: "cp-1",
      storeId: "s1",
      title: "10%",
      discountType: "percent",
      discountValue: 10,
      minOrderAmount: null,
      termsCopy: null,
    },
  ],
  restInsertion: {
    organicIds: ["s1", "s3"],
    rows: [
      { kind: "organic", storeId: "s1" },
      {
        kind: "paid_ad",
        campaignId: "camp-1",
        storeId: "s2",
        title: "Ad",
        headline: "Ad",
        bodyCopy: null,
        imageUrl: null,
        placement: "rest",
        isSponsored: true,
        exposureToken: "tok",
      },
      { kind: "organic", storeId: "s3" },
    ],
    adCount: 1,
    sponsoredStoreIds: ["s2"],
    surfaceAllowed: true,
  },
};

beforeEach(() => {
  resetStoresHomeFeedLiveStoreForTests();
});

describe("DSC-02 home feed cache vs address change", () => {
  it("address change broadcast drops the fresh home-feed client cache (all region suffixes)", () => {
    primeStoreHomeFeedClientCache("", { stores: [store("old-area")], meta: null });
    primeStoreHomeFeedClientCache("?region=Manila", { stores: [store("old-area")], meta: null });
    expect(readStoreHomeFeedClientCache("").isFresh).toBe(true);

    broadcastUserAddressesChanged();

    expect(readStoreHomeFeedClientCache("").entry).toBeNull();
    expect(readStoreHomeFeedClientCache("?region=Manila").entry).toBeNull();
  });

  it("revalidated rows replace the painted cache rows only when they differ", () => {
    const painted = [store("a", { distanceKm: 1.2 }), store("b", { distanceKm: 3 })];
    expect(storesHomeFeedRevalidatedStoresChanged(painted, painted)).toBe(false);
    expect(
      storesHomeFeedRevalidatedStoresChanged(painted, [
        store("a", { distanceKm: 1.2 }),
        store("b", { distanceKm: 3 }),
      ])
    ).toBe(false);
    // 같은 매장 수 — 새 주소 기준 거리만 바뀜
    expect(
      storesHomeFeedRevalidatedStoresChanged(painted, [
        store("a", { distanceKm: 8.4 }),
        store("b", { distanceKm: 3 }),
      ])
    ).toBe(true);
    // 새 주소 반경 안 매장 집합이 다름
    expect(storesHomeFeedRevalidatedStoresChanged(painted, [store("c")])).toBe(true);
  });
});

describe("ADC-12 sponsored rows are not served from client caches", () => {
  it("client cache keeps organic order + coupons but no paid rows", () => {
    primeStoreHomeFeedClientCache("", {
      stores: [store("s1"), store("s2"), store("s3")],
      meta: { source: "supabase", homeInsertions: insertionsWithAd } as { source?: string },
    });
    const meta = readStoreHomeFeedClientCache("").entry?.meta as { homeInsertions: StoresHomeInsertionMeta };
    expect(meta.homeInsertions.paidAds).toEqual([]);
    expect(meta.homeInsertions.restInsertion.rows).toEqual([
      { kind: "organic", storeId: "s1" },
      { kind: "organic", storeId: "s3" },
    ]);
    expect(meta.homeInsertions.restInsertion.adCount).toBe(0);
    expect(meta.homeInsertions.restInsertion.sponsoredStoreIds).toEqual([]);
    expect(meta.homeInsertions.coupons).toHaveLength(1);
    // 원본 응답 meta 는 변경하지 않음 (현재 마운트 렌더는 서버 응답 그대로)
    expect(insertionsWithAd.restInsertion.rows).toHaveLength(3);
  });

  it("live snapshot keeps no paid rows", () => {
    writeStoresHomeFeedLiveStore("", [store("s1")], {
      source: "supabase",
      homeInsertions: insertionsWithAd,
    } as { source?: string });
    const meta = readStoresHomeFeedLiveStore()?.meta as { homeInsertions: StoresHomeInsertionMeta };
    expect(meta.homeInsertions.paidAds).toEqual([]);
    expect(meta.homeInsertions.restInsertion.rows.every((r) => r.kind === "organic")).toBe(true);
  });
});
