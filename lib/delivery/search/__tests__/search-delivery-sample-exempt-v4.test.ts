/**
 * v4 PL-01 — 샘플 매장(store_kind='sample')은 검색의 배달 조건을 면제한다.
 * - 매장: `delivery_available=true OR store_kind=sample` (실매장 조건 그대로)
 * - 메뉴: 실매장은 `local_delivery_available=true` 그대로, 샘플 부모 메뉴는 별도 조회로 병합
 * v4 PERF-12 — 운영에서 검색 console.log 없음.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; select: string; filters: Array<[string, string, unknown]> };
const calls: Call[] = [];

const STORE = (id: string, kind: "sample" | "real", deliveryAvailable: boolean) => ({
  id,
  slug: id,
  store_name: `Chicken ${id}`,
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
  store_kind: kind,
  delivery_available: deliveryAvailable,
});
const STORES = [
  STORE("sample-off", "sample", false),
  STORE("real-on", "real", true),
  STORE("real-off", "real", false),
];
const PRODUCT = (id: string, storeId: string, extra: Record<string, unknown> = {}) => ({
  id,
  store_id: storeId,
  title: "Chicken meal",
  summary: null,
  price: 100,
  discount_price: null,
  thumbnail_url: null,
  item_type: "menu",
  admin_review_status: "none",
  is_featured: false,
  sort_order: 0,
  created_at: "2026-10-01T00:00:00Z",
  store_menu_sections: { is_hidden: false },
  ...extra,
});
/** 실매장 메뉴 (배달 가능) */
const REAL_PRODUCTS = [PRODUCT("m-real", "real-on", { local_delivery_available: true, sort_order: 2 })];
/** 샘플 매장 메뉴 — local_delivery_available=false (운영 287개 전부) */
const SAMPLE_PRODUCTS = [
  PRODUCT("m-sample", "sample-off", { local_delivery_available: false, sort_order: 1, stores: { store_kind: "sample" } }),
];

function orAllowsSample(filters: Call["filters"]): boolean {
  return filters.some(([m, , v]) => m === "or" && String(v).includes("store_kind.eq.sample"));
}

function fakeSb() {
  return {
    from(table: string) {
      const call: Call = { table, select: "", filters: [] };
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "or", "order", "not", "limit", "in"]) {
        chain[m] = (col: string, val?: unknown) => {
          call.filters.push([m, String(col), m === "or" ? col : val]);
          return chain;
        };
      }
      chain.select = (cols: string) => {
        call.select = cols;
        return chain;
      };
      chain.then = (res: (v: unknown) => unknown) => {
        calls.push(call);
        let data: unknown[] = [];
        if (table === "stores") {
          const inIds = call.filters.find(([m]) => m === "in")?.[2] as string[] | undefined;
          data = STORES.filter((s) => (inIds ? inIds.includes(s.id) : true)).filter(
            (s) => s.delivery_available || (orAllowsSample(call.filters) && s.store_kind === "sample")
          );
        } else if (table === "store_products") {
          const sampleQuery = call.filters.some(([m, c, v]) => m === "eq" && c === "stores.store_kind" && v === "sample");
          const realQuery = call.filters.some(([m, c, v]) => m === "eq" && c === "local_delivery_available" && v === true);
          data = sampleQuery ? SAMPLE_PRODUCTS : realQuery ? REAL_PRODUCTS : [];
        }
        return Promise.resolve({ data, error: null }).then(res);
      };
      return chain;
    },
  };
}

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeSb() }));
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

import {
  DELIVERY_SEARCH_STORE_DELIVERY_OR,
  mergeDeliverySearchProductRows,
  searchDeliveryDomain,
  type DeliverySearchProductRow,
} from "@/lib/delivery/search/search-delivery";

const member = { userId: "u-1", source: "saved_address" as const, lat: 14.6, lng: 121.0, canonicalLguId: null };

afterEach(() => {
  calls.length = 0;
  vi.restoreAllMocks();
});

describe("v4 PL-01 샘플 검색 배달 조건 면제", () => {
  it("샘플 매장(delivery_available=false)은 노출, 배달 불가 실매장은 계속 제외", async () => {
    const r = await searchDeliveryDomain({ q: "chicken", origin: member, storeLimit: 10, menuLimit: 10 });
    const ids = r.stores.map((s) => s.id);
    expect(ids).toContain("sample-off");
    expect(ids).toContain("real-on");
    expect(ids).not.toContain("real-off");
    expect(r.stores.find((s) => s.id === "sample-off")?.isSampleStore).toBe(true);
    const storeCalls = calls.filter((c) => c.table === "stores");
    expect(storeCalls.length).toBeGreaterThan(0);
    for (const c of storeCalls) {
      expect(c.filters.some(([m, , v]) => m === "or" && v === DELIVERY_SEARCH_STORE_DELIVERY_OR)).toBe(true);
      // 예전 `.eq("delivery_available", true)` 단독 조건은 없음
      expect(c.filters.some(([m, col]) => m === "eq" && col === "delivery_available")).toBe(false);
    }
  });

  it("샘플 메뉴(local_delivery_available=false)도 노출, 실매장 메뉴 조건은 그대로", async () => {
    const r = await searchDeliveryDomain({ q: "chicken", origin: member, storeLimit: 10, menuLimit: 10 });
    const menuIds = r.menus.map((m) => m.id);
    expect(menuIds).toEqual(["m-sample", "m-real"]);
    expect(r.menus.find((m) => m.id === "m-sample")?.isSampleStore).toBe(true);
    for (const m of r.menus) expect(m).not.toHaveProperty("stores");
    const productCalls = calls.filter((c) => c.table === "store_products");
    expect(productCalls).toHaveLength(2);
    const real = productCalls.find((c) => c.filters.some(([m, col]) => m === "eq" && col === "local_delivery_available"));
    expect(real?.filters.some(([m, col, v]) => m === "eq" && col === "local_delivery_available" && v === true)).toBe(true);
    const sample = productCalls.find((c) => c.select.includes("stores!inner"));
    expect(sample?.filters.some(([m, col, v]) => m === "eq" && col === "stores.store_kind" && v === "sample")).toBe(true);
    expect(sample?.filters.some(([m, col]) => m === "eq" && col === "local_delivery_available")).toBe(false);
  });

  it("병합: id 중복 제거 + 단일 쿼리와 같은 정렬(is_featured DESC → sort_order ASC → created_at DESC)", () => {
    const row = (id: string, extra: Partial<DeliverySearchProductRow>) =>
      ({ id, store_id: "s", title: id, summary: null, price: 1, discount_price: null, thumbnail_url: null, ...extra }) as DeliverySearchProductRow;
    const merged = mergeDeliverySearchProductRows(
      [row("a", { is_featured: false, sort_order: 1 }), row("dup", { is_featured: true, sort_order: 5 })],
      [
        row("dup", { is_featured: true, sort_order: 5 }),
        row("b", { is_featured: true, sort_order: 9 }),
        row("c", { is_featured: false, sort_order: 1, created_at: "2026-10-02T00:00:00Z" }),
      ]
    );
    expect(merged.map((r) => r.id)).toEqual(["dup", "b", "c", "a"]);
  });

  it("v4 PERF-12 — 운영(NODE_ENV≠development) 검색은 console.log 를 남기지 않는다", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await searchDeliveryDomain({ q: "chicken", origin: member, storeLimit: 10, menuLimit: 10 });
    expect(spy).not.toHaveBeenCalled();
  });
});
