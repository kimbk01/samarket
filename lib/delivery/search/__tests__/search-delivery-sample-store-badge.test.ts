/**
 * 묶음3-A S-03 — 검색 결과(매장·메뉴)에 `isSampleStore` boolean 포함, `store_kind` 원문은 응답에 없음.
 */
import { describe, expect, it, vi } from "vitest";

const STORES = [
  {
    id: "sample-1",
    slug: "sample-1",
    store_name: "Chicken Sample",
    description: null,
    profile_image_url: null,
    rating_avg: 5,
    review_count: 0,
    district: null,
    city: null,
    region: null,
    lat: 14.6,
    lng: 121.0,
    delivery_radius_km: 10,
    store_kind: "sample",
  },
  {
    id: "real-1",
    slug: "real-1",
    store_name: "Chicken Real",
    description: null,
    profile_image_url: null,
    rating_avg: 4,
    review_count: 0,
    district: null,
    city: null,
    region: null,
    lat: 14.6,
    lng: 121.0,
    delivery_radius_km: 10,
    store_kind: "real",
  },
];
const PRODUCTS = [
  {
    id: "m-1",
    store_id: "sample-1",
    title: "Chicken meal",
    summary: null,
    price: 100,
    discount_price: null,
    thumbnail_url: null,
    item_type: "menu",
    admin_review_status: "none",
    store_menu_sections: { is_hidden: false },
  },
];
const selects: Record<string, string[]> = {};

function fakeSb() {
  return {
    from(table: string) {
      let inIds: string[] | null = null;
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["eq", "or", "order", "not", "limit"]) chain[m] = self;
      chain.select = (cols: string) => {
        (selects[table] ??= []).push(cols);
        return chain;
      };
      chain.in = (_c: string, ids: string[]) => {
        inIds = ids;
        return chain;
      };
      chain.then = (res: (v: unknown) => unknown) => {
        const data =
          table === "stores"
            ? inIds
              ? STORES.filter((r) => inIds!.includes(r.id))
              : STORES
            : table === "store_products"
              ? PRODUCTS
              : [];
        return Promise.resolve({ data, error: null }).then(res);
      };
      return chain;
    },
  };
}

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeSb() }));
vi.mock("@/lib/addresses/user-address-service", () => ({
  getUserAddressDefaults: async () => ({ master: null }),
}));
vi.mock("@/lib/delivery/service-area/load-store-service-area-runtime-map", () => ({
  loadStoreServiceAreaRuntimeMap: async () => new Map(),
}));
vi.mock("@/lib/delivery/load-delivery-serviceability-runtime", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    loadDeliveryServiceabilityRuntimeContext: async () => ({
      policy: { enabled: false, source: "straight", defaultMaxKm: 10, overDistanceBehavior: "exclude" },
      overrides: { stores: {} },
    }),
  };
});
vi.mock("@/lib/stores/load-store-search-top-banners", () => ({
  loadStoresSearchTopBannerSlide: async () => null,
}));

import { searchDeliveryDomain } from "@/lib/delivery/search/search-delivery";

describe("S-03 search sample badge field", () => {
  it("매장·메뉴 결과에 isSampleStore, store_kind 미노출", async () => {
    const r = await searchDeliveryDomain({ q: "chicken", userId: null, storeLimit: 10, menuLimit: 10 });
    expect(r.ok).toBe(true);
    const byId = new Map(r.stores.map((s) => [s.id, s]));
    expect(byId.get("sample-1")?.isSampleStore).toBe(true);
    expect(byId.get("real-1")?.isSampleStore).toBe(false);
    for (const s of r.stores) expect(s).not.toHaveProperty("store_kind");
    expect(r.menus.find((m) => m.id === "m-1")?.isSampleStore).toBe(true);
    expect(selects.stores?.every((c) => c.includes("store_kind"))).toBe(true);
  });
});
