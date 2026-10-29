/**
 * 묶음4 F-01·F-02·F-03·F-05 — home-feed 캐시 키(언어·주소·정책 분리), 구성 정책 1회 조회,
 * 랭킹 단계 서비스 영역·거리 정책 재사용.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildStoreHomeFeedCacheKey,
  buildStoreHomeFeedServiceabilityPolicyKey,
  clearStoreHomeFeedServerCache,
  getStoreHomeFeedCache,
  setStoreHomeFeedCache,
  STORE_HOME_FEED_SERVER_CACHE_MAX_ENTRIES,
  type StoreHomeFeedCachedPayload,
} from "@/lib/stores/store-home-feed-server-cache";
import { loadHomeFeedCompositionPolicyMeta } from "@/lib/stores/composition/stores-composition-home-feed-meta";
import { loadStoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import { resolveDefaultCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import { resolveDiscoveryOorWithServiceAreaAuthority } from "@/lib/stores/discovery/resolve-discovery-oor-with-service-area";

type Call = { table: string; select?: string };

/** 테이블별 호출 기록 + 결과 주입용 최소 Supabase 체인 */
function recordingSb(results: Record<string, { data: unknown; error: unknown }>) {
  const calls: Call[] = [];
  const sb = {
    from(table: string) {
      const call: Call = { table };
      calls.push(call);
      const res = results[table] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      const self = new Proxy(chain, {
        get(_t, p) {
          if (p === "then") return (ok: (v: unknown) => unknown, ng?: (e: unknown) => unknown) =>
            Promise.resolve(res).then(ok, ng);
          if (p === "select") return (cols: string) => {
            call.select = cols;
            return self;
          };
          return () => self;
        },
      });
      return self;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return { sb: sb as never, calls };
}

const basePayload = (id: string): StoreHomeFeedCachedPayload => ({
  ok: true,
  stores: [{ id } as never],
  meta: { source: "supabase", sorted_by: "x" },
});

afterEach(() => clearStoreHomeFeedServerCache());

describe("F-01·F-05 home-feed 캐시 키", () => {
  const base = {
    region: null,
    district: null,
    searchQ: null,
    userLat: 14.5,
    userLng: 121.0,
    originKey: "addr:user-a:addr-1:place:14.500000:121.000000:ident:lgu-1",
    deliveryRideTimeSource: "store" as const,
    uiLang: "ko",
    distancePolicyKey: "on:abc",
    popularityWindowDaysKey: "30",
  };

  it("언어가 다르면 키가 다르다 (F-01)", () => {
    expect(buildStoreHomeFeedCacheKey(base)).not.toBe(buildStoreHomeFeedCacheKey({ ...base, uiLang: "en" }));
  });

  it("사용자·주소·LGU 가 다르면 키가 다르다 (F-05 — 사용자별 배달 범위 판정 분리)", () => {
    const k = buildStoreHomeFeedCacheKey(base);
    expect(k).not.toBe(
      buildStoreHomeFeedCacheKey({ ...base, originKey: base.originKey.replace("user-a", "user-b") })
    );
    expect(k).not.toBe(
      buildStoreHomeFeedCacheKey({ ...base, originKey: base.originKey.replace("addr-1", "addr-2") })
    );
    expect(k).not.toBe(
      buildStoreHomeFeedCacheKey({ ...base, originKey: base.originKey.replace("lgu-1", "lgu-2") })
    );
    expect(k).not.toBe(buildStoreHomeFeedCacheKey({ ...base, userLat: 14.6 }));
  });

  it("거리 정책 키 — 꺼짐은 off, 켜짐은 정책·매장 override 전체 해시", () => {
    const off = buildStoreHomeFeedServiceabilityPolicyKey({ policy: { enabled: false, defaultMaxKm: 5 } });
    expect(off).toBe("off");
    const on = buildStoreHomeFeedServiceabilityPolicyKey({
      policy: { enabled: true, defaultMaxKm: 5 },
      overrides: { s1: { maxKm: 3 } },
    });
    expect(on).toMatch(/^on:[0-9a-f]{16}$/);
    expect(
      buildStoreHomeFeedServiceabilityPolicyKey({
        policy: { enabled: true, defaultMaxKm: 5 },
        overrides: { s1: { maxKm: 4 } },
      })
    ).not.toBe(on);
    expect(
      buildStoreHomeFeedServiceabilityPolicyKey({ policy: { enabled: true, defaultMaxKm: 6 }, overrides: { s1: { maxKm: 3 } } })
    ).not.toBe(on);
  });

  it("다른 사용자 키로는 캐시가 읽히지 않는다", () => {
    const keyA = buildStoreHomeFeedCacheKey(base);
    const keyB = buildStoreHomeFeedCacheKey({ ...base, originKey: base.originKey.replace("user-a", "user-b") });
    setStoreHomeFeedCache(keyA, basePayload("store-a"));
    expect(getStoreHomeFeedCache(keyA)?.stores[0]?.id).toBe("store-a");
    expect(getStoreHomeFeedCache(keyB)).toBeNull();
  });

  it("항목 상한 — 넘치면 가장 오래된 항목부터 제거", () => {
    for (let i = 0; i <= STORE_HOME_FEED_SERVER_CACHE_MAX_ENTRIES; i += 1) {
      setStoreHomeFeedCache(`k${i}`, basePayload(`s${i}`));
    }
    expect(getStoreHomeFeedCache("k0")).toBeNull();
    expect(getStoreHomeFeedCache(`k${STORE_HOME_FEED_SERVER_CACHE_MAX_ENTRIES}`)).not.toBeNull();
  });
});

describe("F-02 구성 정책 요청당 1회 조회", () => {
  it("구성 정책·선반 상품을 store_composition_policy_overrides 1회 select 로 만든다", async () => {
    const { sb, calls } = recordingSb({
      store_composition_policy_overrides: { data: [], error: null },
    });
    const meta = await loadHomeFeedCompositionPolicyMeta(sb);
    expect(meta).not.toBeNull();
    const policyCalls = calls.filter((c) => c.table === "store_composition_policy_overrides");
    expect(policyCalls).toHaveLength(1);
    expect(policyCalls[0]!.select).toContain("interval_consumed");
    expect(policyCalls[0]!.select).toContain("product_config");
    expect(meta!.rows.length).toBe(resolveDefaultCompositionPolicy("home").length);
  });

  it("선반 열이 없는 구 스키마(title_ko 오류)는 정책만 다시 읽고 선반은 비운다", async () => {
    let n = 0;
    const sb = {
      from() {
        n += 1;
        const res =
          n === 1 ?
            { data: null, error: { message: 'column "title_ko" does not exist', code: "42703" } }
          : { data: [], error: null };
        const self: unknown = new Proxy(
          {},
          {
            get(_t, p) {
              if (p === "then") return (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
              return () => self;
            },
          }
        );
        return self;
      },
    };
    const meta = await loadHomeFeedCompositionPolicyMeta(sb as never);
    expect(n).toBe(2);
    expect(meta?.shelfProduct.shelves.length ?? -1).toBeGreaterThanOrEqual(0);
  });

  it("insertion 메타는 전달받은 정책 행을 쓰고 정책 테이블을 다시 읽지 않는다", async () => {
    const { sb, calls } = recordingSb({});
    await loadStoresHomeInsertionMeta(sb, {
      restOrganicStoreIds: ["a"],
      eligibilityStoreIds: ["a"],
      policyRows: resolveDefaultCompositionPolicy("home"),
    });
    expect(calls.some((c) => c.table === "store_composition_policy_overrides")).toBe(false);
  });

  it("정책 행이 없으면(조회 실패) 기존처럼 자체 조회로 폴백", async () => {
    const { sb, calls } = recordingSb({});
    await loadStoresHomeInsertionMeta(sb, { restOrganicStoreIds: ["a"], policyRows: null });
    expect(calls.filter((c) => c.table === "store_composition_policy_overrides")).toHaveLength(1);
  });
});

describe("F-03 랭킹 단계 서비스 영역·거리 정책 재사용", () => {
  const row = { id: "s1", lat: 14.5, lng: 121, delivery_available: true, is_open: true, business_hours_json: null };

  it("거리축 off/좌표 없음 — 서비스 영역을 읽지 않고 null 반환", async () => {
    const { sb, calls } = recordingSb({});
    const out = await resolveDiscoveryOorWithServiceAreaAuthority(sb, {
      rows: [row],
      originLat: null,
      originLng: null,
      originSource: "none",
      memberLguId: null,
      distanceAxisEnabled: false,
      shadowOutOfRangeById: new Map(),
    });
    expect(out.serviceAreaById).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("거리축 on — 전달받은 거리 정책은 다시 읽지 않고, 읽은 서비스 영역을 반환", async () => {
    const { sb, calls } = recordingSb({
      stores: { data: [{ id: "s1", delivery_service_area_authority: "legacy_radius" }], error: null },
    });
    const out = await resolveDiscoveryOorWithServiceAreaAuthority(sb, {
      rows: [row],
      originLat: 14.5,
      originLng: 121,
      originSource: "saved_address",
      memberLguId: null,
      distanceAxisEnabled: true,
      shadowOutOfRangeById: new Map(),
      serviceabilityCtx: { policy: { enabled: true, defaultMaxKm: 5 } as never, overrides: { stores: {} } as never },
    });
    expect(calls.some((c) => c.table === "admin_settings")).toBe(false);
    expect(calls.filter((c) => c.table === "stores")).toHaveLength(1);
    expect(out.serviceAreaById?.get("s1")).toBeTruthy();
  });
});
