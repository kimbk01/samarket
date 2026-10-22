/**
 * DSC-03 — 회원 지역 노출 판정(OOR 제외) 뒤에 storeLimit/menuLimit 을 적용 (지역 안 매칭이 잘리지 않음).
 * DSC-09 — 검색 메뉴 행도 구매자 판매 가능 규칙(검수 반려·대기, 숨김 구역 제외)을 따름.
 */
import { describe, expect, it, vi } from "vitest";

/** 1° lat ≈ 111km — 회원 위치에서 0.02°(≈2km) = 지역 안, 0.5°(≈55km) = 지역 밖 */
const MEMBER = { lat: 14.6, lng: 121.0 };
const near = (i: number) => ({ lat: MEMBER.lat + 0.02, lng: MEMBER.lng, id: `near-${i}` });
const far = (i: number) => ({ lat: MEMBER.lat + 0.5, lng: MEMBER.lng, id: `far-${i}` });

function storeRow(s: { id: string; lat: number; lng: number }, rating: number) {
  return {
    id: s.id,
    slug: s.id,
    store_name: `Chicken ${s.id}`,
    description: null,
    profile_image_url: null,
    rating_avg: rating,
    review_count: 0,
    district: null,
    city: null,
    region: null,
    lat: s.lat,
    lng: s.lng,
    delivery_radius_km: 10,
  };
}

/** 평점 순(SQL order) — 지역 밖 12곳이 상위, 지역 안 3곳이 하위 */
const STORE_ROWS = [
  ...Array.from({ length: 12 }, (_, i) => storeRow(far(i), 5 - i * 0.01)),
  ...Array.from({ length: 3 }, (_, i) => storeRow(near(i), 3 - i * 0.01)),
];

function productRow(id: string, storeId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    store_id: storeId,
    title: "Chicken meal",
    summary: null,
    price: 100,
    discount_price: null,
    thumbnail_url: null,
    item_type: "menu",
    admin_review_status: "none",
    store_menu_sections: { is_hidden: false },
    ...extra,
  };
}

/** 지역 밖 매장 메뉴 40개가 정렬 상위 → 지역 안 메뉴는 그 뒤 */
const PRODUCT_ROWS = [
  ...Array.from({ length: 40 }, (_, i) => productRow(`pf-${i}`, `far-${i % 12}`)),
  productRow("pn-ok", "near-0"),
  productRow("pn-review-pending", "near-0", { admin_review_status: "pending" }),
  productRow("pn-rejected", "near-1", { admin_review_status: "rejected" }),
  productRow("pn-hidden-section", "near-1", { store_menu_sections: [{ is_hidden: true }] }),
  productRow("pn-no-section", "near-2", { store_menu_sections: null }),
];

const limits: Record<string, number> = {};

function fakeSb() {
  return {
    from(table: string) {
      let inIds: string[] | null = null;
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq", "or", "order", "not"]) chain[m] = self;
      chain.in = (_col: string, ids: string[]) => {
        inIds = ids;
        return chain;
      };
      chain.limit = (n: number) => {
        if (!inIds) limits[table] = n;
        return chain;
      };
      chain.then = (res: (v: unknown) => unknown) => {
        let data: unknown[] = [];
        if (table === "stores") {
          data = inIds ? STORE_ROWS.filter((r) => inIds!.includes(r.id)) : STORE_ROWS;
        } else if (table === "store_products") {
          data = PRODUCT_ROWS;
        }
        return Promise.resolve({ data, error: null }).then(res);
      };
      return chain;
    },
  };
}

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeSb() }));
vi.mock("@/lib/addresses/user-address-service", () => ({
  getUserAddressDefaults: async () => ({
    master: { latitude: 14.6, longitude: 121.0, canonicalLguId: null, cityMunicipality: null, province: null },
  }),
}));
vi.mock("@/lib/delivery/service-area/load-store-service-area-runtime-map", () => ({
  loadStoreServiceAreaRuntimeMap: async () => new Map(),
}));
vi.mock("@/lib/delivery/load-delivery-serviceability-runtime", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    loadDeliveryServiceabilityRuntimeContext: async () => ({
      policy: { enabled: true, source: "straight", defaultMaxKm: 10, overDistanceBehavior: "exclude" },
      overrides: { stores: {} },
    }),
  };
});
vi.mock("@/lib/stores/load-store-search-top-banners", () => ({
  loadStoresSearchTopBannerSlide: async () => null,
}));

import { searchDeliveryDomain } from "@/lib/delivery/search/search-delivery";

describe("DSC-03 search limit after member area filter", () => {
  it("in-range stores below the top-N by rating are still returned; max returned unchanged", async () => {
    const r = await searchDeliveryDomain({ q: "chicken", userId: "member-1", storeLimit: 10, menuLimit: 20 });
    expect(r.stores.map((s) => s.id)).toEqual(["near-0", "near-1", "near-2"]);
    expect(r.stores.every((s) => s.distanceOutOfRange !== true)).toBe(true);
    // 후보는 넓게 읽음 (LIMIT 이 지역 판정 전에 잘라내지 않음)
    expect(limits.stores).toBeGreaterThan(10);
    expect(limits.store_products).toBeGreaterThan(40);
  });

  it("guest: returned stores still capped at storeLimit", async () => {
    const r = await searchDeliveryDomain({ q: "chicken", userId: null, storeLimit: 5 });
    expect(r.stores).toHaveLength(5);
  });
});

describe("DSC-09 search menu rows follow buyer sellability", () => {
  it("in-range menus are returned; under-review / rejected / hidden-section products are excluded", async () => {
    const r = await searchDeliveryDomain({ q: "chicken", userId: "member-1", menuLimit: 20 });
    expect(r.menus.map((m) => m.id).sort()).toEqual(["pn-no-section", "pn-ok"]);
  });
});
