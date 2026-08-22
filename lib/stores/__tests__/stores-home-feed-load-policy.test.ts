import { describe, expect, it, beforeEach } from "vitest";
import {
  applyStoresHomeFeedNetworkResult,
  readStoresHomeFeedExactCacheSnapshot,
  resolveStoresHomeFeedCacheForLoad,
} from "@/lib/stores/stores-home-feed-load-policy";
import { primeStoreHomeFeedClientCache } from "@/lib/stores/store-home-feed-client-cache";
import {
  readStoresHomeFeedLiveStore,
  resetStoresHomeFeedLiveStoreForTests,
  writeStoresHomeFeedLiveStore,
} from "@/lib/stores/stores-home-feed-live-store";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

function store(id: string): StoreHomeFeedItem {
  return {
    id,
    slug: id,
    nameKo: "매장",
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
    regionLabel: "Manila",
    status: "open",
    rating: 0,
    reviewCount: 0,
    deliveryAvailable: true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: null,
    etaLabel: "약 20분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    distanceKm: null,
    featuredItems: [{ productId: "p1", name: "메뉴", price: 100, imageUrl: "/img.jpg" }],
    profileImageUrl: "/profile-dog.jpg",
    isFeatured: false,
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
  };
}

describe("applyStoresHomeFeedNetworkResult", () => {
  beforeEach(() => {
    primeStoreHomeFeedClientCache("", { stores: [store("cached")], meta: { source: "supabase" } });
  });

  it("keeps previous stores on network 500 (re-entry regression)", () => {
    const prev = [store("live-a"), store("live-b")];
    const next = applyStoresHomeFeedNetworkResult({
      querySuffix: "",
      status: 500,
      json: { ok: false, stores: [] },
      previousStores: prev,
      previousMeta: null,
    });
    expect(next.stores.map((s) => s.id)).toEqual(["live-a", "live-b"]);
  });

  it("falls back to client cache when previous empty and fetch fails", () => {
    const next = applyStoresHomeFeedNetworkResult({
      querySuffix: "",
      status: 500,
      json: { ok: false, stores: [] },
      previousStores: [],
      previousMeta: null,
    });
    expect(next.stores.map((s) => s.id)).toEqual(["cached"]);
  });

  it("uses region suffix cache with empty-key fallback", () => {
    const snap = resolveStoresHomeFeedCacheForLoad("?region=Quezon");
    expect(snap.entryStores.map((s) => s.id)).toEqual(["cached"]);
  });
});

describe("stores-home-feed-live-store", () => {
  beforeEach(() => {
    resetStoresHomeFeedLiveStoreForTests();
  });

  it("does not wipe live snapshot with empty network payload", () => {
    writeStoresHomeFeedLiveStore("", [store("live-a")], null);
    writeStoresHomeFeedLiveStore("", [], null);
    expect(readStoresHomeFeedLiveStore()?.stores.map((s) => s.id)).toEqual(["live-a"]);
  });
});

describe("readStoresHomeFeedExactCacheSnapshot", () => {
  beforeEach(() => {
    resetStoresHomeFeedLiveStoreForTests();
  });

  it("returns exact suffix client cache and ignores root fallback", () => {
    primeStoreHomeFeedClientCache("", { stores: [store("root")], meta: null });
    primeStoreHomeFeedClientCache("?region=Manila", { stores: [store("manila")], meta: null });
    expect(readStoresHomeFeedExactCacheSnapshot("?region=Manila")?.stores.map((s) => s.id)).toEqual([
      "manila",
    ]);
    expect(readStoresHomeFeedExactCacheSnapshot("?region=Quezon")).toBeNull();
  });

  it("requires live store querySuffix to match", () => {
    writeStoresHomeFeedLiveStore("?region=Manila", [store("live-m")], null);
    // live miss for ""; no client entry for "" in this case either after only region live
    expect(readStoresHomeFeedExactCacheSnapshot("?region=Quezon")).toBeNull();
    expect(readStoresHomeFeedExactCacheSnapshot("?region=Manila")?.stores.map((s) => s.id)).toEqual([
      "live-m",
    ]);
  });
});
