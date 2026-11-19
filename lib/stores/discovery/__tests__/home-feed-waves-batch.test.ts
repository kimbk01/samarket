import { describe, expect, it, vi } from "vitest";

/** 2026-11-19 — HOME 매장 탐색 단계 RPC 5.7회/요청 → 묶음 1회. 정렬 결과 동일·묶음 함수 없으면 기존 동작 */
function poolRow(gi: number, dj: number, i: number) {
  return {
    id: `s-${gi}-${dj}-${i}`,
    slug: `s${gi}${dj}${i}`,
    district: dj === 0 ? "D" : `X${dj}`,
    rating_avg: 4,
    review_count: 1,
    delivery_available: true,
    discovery_schedule_state: "open",
    completed_orders_30d: 10 - i,
    lat: null,
    lng: null,
    distance_km: null,
    out_of_range: false,
    eligibility_rank: gi,
    district_tier: dj,
    policy_version: 1,
  };
}
const pool = (gi: number, dj: number) => Array.from({ length: gi === 0 ? 5 : 30 }, (_, i) => poolRow(gi, dj, i));

function makeSb(batchAvailable: boolean) {
  const calls: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    if (name === "get_store_discovery_shadow_wave") {
      const rows = pool(args.p_eligibility_rank as number, args.p_district_tier as number).slice(0, args.p_limit as number);
      return { data: rows, error: null };
    }
    if (name === "get_store_discovery_shadow_waves_batch") {
      if (!batchAvailable) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      const ranks = args.p_eligibility_ranks as number[];
      const tiers = args.p_district_tiers as number[];
      const limits = args.p_limits as number[];
      const out = ranks.flatMap((gi, i) => pool(gi, tiers[i]).slice(0, limits[i]).map((r) => ({ wave_ord: i, ...r })));
      return { data: out, error: null };
    }
    return { data: null, error: { message: "unexpected" } };
  });
  return { sb: { rpc } as never, calls };
}

const input = {
  originLat: null,
  originLng: null,
  district: "D",
  searchQ: null,
  distanceAxisEnabled: false,
  exposureScope: "home:test",
  nowMs: 1_800_000_000_000,
  limit: 20,
};

describe("HOME 매장 탐색 단계 묶음", () => {
  it("묶음 1회로 같은 정렬 결과", async () => {
    vi.resetModules();
    const a = await import("@/lib/stores/discovery/store-discovery-shadow-adapter");
    const withBatch = makeSb(true);
    const r1 = await a.loadStoreDiscoveryHomeShadowViaRpc(withBatch.sb, input);
    vi.resetModules();
    const b = await import("@/lib/stores/discovery/store-discovery-shadow-adapter");
    const noBatch = makeSb(false);
    const r2 = await b.loadStoreDiscoveryHomeShadowViaRpc(noBatch.sb, input);
    expect(r1.status).toBe("ok");
    expect(r1.rows.map((r) => r.id)).toEqual(r2.rows.map((r) => r.id));
    expect(withBatch.calls).toEqual(["get_store_discovery_shadow_waves_batch"]);
    expect(noBatch.calls.filter((c) => c === "get_store_discovery_shadow_wave").length).toBeGreaterThan(1);
  });

  it("묶음 함수가 없으면 이 인스턴스에서 다시 부르지 않는다(실패 호출 누적 방지)", async () => {
    vi.resetModules();
    const a = await import("@/lib/stores/discovery/store-discovery-shadow-adapter");
    const s = makeSb(false);
    await a.loadStoreDiscoveryHomeShadowViaRpc(s.sb, input);
    await a.loadStoreDiscoveryHomeShadowViaRpc(s.sb, input);
    expect(s.calls.filter((c) => c === "get_store_discovery_shadow_waves_batch").length).toBe(1);
  });
});
