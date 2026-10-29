/**
 * 묶음4 — home-feed GET 핸들러: F-05 거리축 회원 캐시(언어·사용자 분리), F-02 정책 1회, F-09 500 고정 코드.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  origin: null as Record<string, unknown> | null,
  rankCalls: 0,
  policyLoads: 0,
  rankImpl: null as null | (() => Promise<unknown>),
}));

vi.mock("@/lib/stores/try-supabase-stores", () => {
  const self: unknown = new Proxy(
    {},
    {
      get(_t, p) {
        if (p === "then") return (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
        return () => self;
      },
    }
  );
  return { tryGetSupabaseForStores: () => ({ from: () => self, rpc: async () => ({ data: [], error: null }) }) };
});
vi.mock("@/lib/stores/store-list-delivery-origin", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/store-list-delivery-origin")>()),
  resolveStoreListDeliveryOrigin: async () => h.origin,
  loadOwnerDefaultAddressByUserId: async () => new Map(),
}));
vi.mock("@/lib/delivery/delivery-ops-settings", () => ({ loadDeliveryRideTimeSource: async () => "store" }));
vi.mock("@/lib/delivery/load-delivery-serviceability-runtime", async (orig) => ({
  ...(await orig<typeof import("@/lib/delivery/load-delivery-serviceability-runtime")>()),
  loadDeliveryServiceabilityRuntimeContext: async () => ({
    policy: { enabled: true, defaultMaxKm: 5 },
    overrides: { stores: {} },
  }),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  syncStorePublicReadCachesWithSharedGeneration: async () => {},
}));
vi.mock("@/lib/stores/composition/stores-composition-home-feed-meta", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/composition/stores-composition-home-feed-meta")>()),
  loadHomeFeedCompositionPolicyMeta: async () => {
    h.policyLoads += 1;
    return null;
  },
}));
vi.mock("@/lib/stores/composition/stores-composition-home-insertion-meta", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/composition/stores-composition-home-insertion-meta")>()),
  loadStoresHomeInsertionMeta: async () => null,
}));
vi.mock("@/lib/stores/discovery/store-discovery-ranking-authority", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/discovery/store-discovery-ranking-authority")>()),
  isStoreDiscoveryRankingAuthorityNew: () => true,
  resolveStoreDiscoveryRankingAuthority: () => "new",
}));
vi.mock("@/lib/stores/discovery/load-store-discovery-ranked-live", () => ({
  loadHomeDiscoveryRankedForLive: async () => {
    h.rankCalls += 1;
    if (h.rankImpl) return h.rankImpl();
    return {
      ok: true,
      rows: [
        {
          id: "s1",
          slug: "s1",
          store_name: "S1",
          lat: 14.5,
          lng: 121,
          delivery_available: true,
          is_open: true,
          business_hours_json: null,
          created_at: "2026-01-01",
          rating_avg: 4,
          review_count: 1,
        },
      ],
      ranked: [],
      eligibilityRankById: new Map([["s1", 0]]),
      outOfRangeById: new Map([["s1", false]]),
      distById: new Map([["s1", 1]]),
      completedOrders30dById: new Map([["s1", 0]]),
      serviceAreaById: new Map(),
    };
  },
}));
vi.mock("@/lib/stores/load-store-discovery-campaigns-for-home", () => ({
  loadActiveStoreDiscoveryCampaignsForHome: async () => ({ status: "ok", byStoreId: new Map() }),
  attachDiscoveryCampaignsToHomeFeedStores: async (_sb: unknown, stores: unknown[]) => ({ status: "ok", stores }),
  mapDiscoveryCampaignHomePayload: (r: unknown) => r,
}));

import { GET } from "@/app/api/stores/home-feed/route";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";

function member(userId: string, addressId = "addr-1") {
  return {
    source: "saved_address",
    userId,
    addressId,
    placeId: null,
    lat: 14.5,
    lng: 121,
    addressIdentity: "ident",
    canonicalLguId: "lgu-1",
    cacheKeyPart: ["addr", userId, addressId, "", "14.500000", "121.000000", "ident", "lgu-1"].join(":"),
  };
}

async function call(lang = "ko") {
  const res = await GET(
    new Request("http://localhost/api/stores/home-feed", { headers: { "accept-language": lang } })
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  clearStoreHomeFeedServerCache();
  h.rankCalls = 0;
  h.policyLoads = 0;
  h.rankImpl = null;
});
afterEach(() => vi.restoreAllMocks());

describe("F-05 거리축 켜진 저장주소 회원 — 안전한 키로 메모리 캐시", () => {
  it("같은 사용자·주소·언어 재요청은 캐시 히트 (랭킹 재계산 없음), 요청마다 정책은 1회만", async () => {
    h.origin = member("user-a");
    const first = await call("ko");
    expect(first.status).toBe(200);
    expect((first.json.stores as unknown[]).length).toBe(1);
    expect(h.rankCalls).toBe(1);
    expect(h.policyLoads).toBe(1);
    await call("ko");
    expect(h.rankCalls).toBe(1);
    expect(h.policyLoads).toBe(2);
  });

  it("언어가 다르면 캐시를 공유하지 않는다 (F-01)", async () => {
    h.origin = member("user-a");
    await call("ko");
    await call("en");
    expect(h.rankCalls).toBe(2);
  });

  it("다른 사용자·다른 주소는 캐시를 공유하지 않는다", async () => {
    h.origin = member("user-a");
    await call();
    h.origin = member("user-b");
    await call();
    h.origin = member("user-a", "addr-2");
    await call();
    expect(h.rankCalls).toBe(3);
  });
});

describe("F-09 500 응답 고정 오류 코드", () => {
  it("내부 예외 문구를 응답에 싣지 않는다", async () => {
    h.origin = member("user-err");
    h.rankImpl = async () => {
      throw new Error("relation secret_table does not exist");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(500);
    expect(res.json.error).toBe("home_feed_failed");
    expect(JSON.stringify(res.json)).not.toContain("secret_table");
    expect(spy).toHaveBeenCalled();
  });
});
