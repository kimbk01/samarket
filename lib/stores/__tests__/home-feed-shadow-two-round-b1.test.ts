import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createInMemoryShadowWaveFetcher,
  fillHomeShadowRankedViaTwoRoundWaves,
  fillShadowRankedViaWaves,
  type ShadowWaveBatchFetchFn,
  type StoreDiscoveryShadowCandidate,
} from "@/lib/stores/discovery/store-discovery-shadow-ranked";

const STATES = ["ORDERABLE", "IN_BREAK", "PREPARING", "CLOSED", "UNKNOWN", null] as const;

function pool(n: number): StoreDiscoveryShadowCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${String(i).padStart(3, "0")}`,
    slug: `s${i}`,
    district: i % 3 === 0 ? "Makati" : "Pasig",
    rating_avg: 3 + (i % 5) * 0.4,
    review_count: i * 3,
    delivery_available: true,
    discovery_schedule_state: STATES[i % STATES.length]!,
    completed_orders_30d: (i * 13) % 17,
    lat: 14.55,
    lng: 121.02,
    coverage: { distanceApplies: false, coversAll: true, hasCoverageGeog: false, originCovered: true },
  }));
}

describe("B1 HOME two-round wave fill", () => {
  it("matches serial fillShadowRankedViaWaves id order (hasGeo)", async () => {
    const candidates = pool(80).map((c) => ({
      ...c,
      discovery_schedule_state: "ORDERABLE" as const,
    }));
    const base = createInMemoryShadowWaveFetcher(candidates, {
      district: "Makati",
      originLat: 14.55,
      originLng: 121.02,
      distanceAxisEnabled: true,
      sort: "home",
    });
    const fetchWaveBatch: ShadowWaveBatchFetchFn = async (tasks) =>
      Promise.all(tasks.map((t) => base(t)));

    const serial = await fillShadowRankedViaWaves({
      fetchWave: base,
      district: "Makati",
      sort: "home",
      exposureScope: "b1-test",
      applyExposure: true,
      targetCount: 24,
      nowMs: 1_700_000_000_000,
      hasGeo: true,
    });
    const twoRound = await fillHomeShadowRankedViaTwoRoundWaves({
      fetchWave: base,
      fetchWaveBatch,
      district: "Makati",
      exposureScope: "b1-test",
      nowMs: 1_700_000_000_000,
      limit: 24,
      hasGeo: true,
    });
    expect(twoRound.rows.map((r) => r.id)).toEqual(serial.rows.map((r) => r.id));
  });

  it("uses at most 2 batch/wave round-trips when Gi0 does not fill (hasGeo)", async () => {
    const candidates = pool(20).map((c, i) => ({
      ...c,
      discovery_schedule_state: (i < 3 ? "ORDERABLE" : "CLOSED") as "ORDERABLE" | "CLOSED",
    }));
    const base = createInMemoryShadowWaveFetcher(candidates, {
      district: null,
      originLat: 14.55,
      originLng: 121.02,
      distanceAxisEnabled: true,
      sort: "home",
    });
    let batchCalls = 0;
    let singleCalls = 0;
    const fetchWave = async (
      input: { eligibilityRank: number; districtTier: number; limit: number }
    ) => {
      singleCalls += 1;
      return base(input);
    };
    const fetchWaveBatch: ShadowWaveBatchFetchFn = async (tasks) => {
      batchCalls += 1;
      return Promise.all(tasks.map((t) => base(t)));
    };
    const res = await fillHomeShadowRankedViaTwoRoundWaves({
      fetchWave,
      fetchWaveBatch,
      district: null,
      exposureScope: "b1-rt",
      nowMs: 1_700_000_000_000,
      limit: 10,
      hasGeo: true,
    });
    expect(res.rows.length).toBeGreaterThan(0);
    // Round1 single Gi0 + Round2 one batch
    expect(singleCalls).toBe(1);
    expect(batchCalls).toBe(1);
  });

  it("migration defines batch RPC with service_role only", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261118160000_store_discovery_shadow_waves_batch_b1.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("get_store_discovery_shadow_waves_batch");
    expect(sql).toContain("get_store_discovery_shadow_wave");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_store_discovery_shadow_waves_batch[\s\S]*FROM PUBLIC, anon, authenticated/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_store_discovery_shadow_waves_batch[\s\S]*TO service_role/
    );
  });
});
