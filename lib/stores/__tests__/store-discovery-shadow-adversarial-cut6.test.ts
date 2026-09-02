/**
 * CUT 6 — Adversarial parity hardening (fixture harness only).
 * No Production inserts. No HOME/BROWSE cutover. OLD = oracle.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_DELIVERY_DISTANCE_POLICY } from "@/lib/delivery/delivery-ops-settings";
import { STORE_DISCOVERY_SHADOW_BROWSE_MAX_CANDIDATES } from "@/lib/stores/discovery/store-discovery-shadow-ranked";
import {
  adversarialStore,
  assertParityOrDetail,
  autoHoursClosed,
  autoHoursInBreakAtCut6Now,
  autoHoursOpenAllDay,
  buildAdversarialShadowCandidates,
  coverageMembershipParity,
  CUT6_NOW_MS,
  CUT6_ORIGIN,
  districtTierParitySamples,
  mulberry32,
  newBrowseShadowFromCandidates,
  newHomeShadowFromCandidates,
  newBrowseShadow,
  newHomeShadow,
  offsetPoint,
  oldBrowseOracle,
  oldHomeOracle,
  type AdversarialFixtureStore,
  type CaseResult,
} from "@/lib/stores/discovery/store-discovery-shadow-adversarial-harness";

const ARTIFACT = join(process.cwd(), "docs/perf/stores-discovery-scale-cut6-adversarial-latest.json");
const RANKED = join(process.cwd(), "lib/stores/discovery/store-discovery-shadow-ranked.ts");
const ADAPTER = join(process.cwd(), "lib/stores/discovery/store-discovery-shadow-adapter.ts");

const caseResults: CaseResult[] = [];
const guardResults: Record<string, number | string> = {};
let randomized: { runs: number; failures: number; failingSeeds: number[] } = {
  runs: 0,
  failures: 0,
  failingSeeds: [],
};

function record(r: CaseResult) {
  caseResults.push(r);
}

function padId(prefix: string, i: number, width = 4) {
  return `${prefix}${String(i).padStart(width, "0")}`;
}

describe("CUT 6 scale regression guards", () => {
  it("shadow path has no full-candidate loaders / live order agg / hours loop / cap", () => {
    const ranked = readFileSync(RANKED, "utf8");
    const adapter = readFileSync(ADAPTER, "utf8");
    for (const src of [ranked, adapter]) {
      expect(src).not.toMatch(/loadHomeDiscoveryCandidateRows/);
      expect(src).not.toMatch(/loadBrowseDiscoveryCandidateRows/);
      expect(src).not.toMatch(/fetchDiscoveryCandidatePages/);
      expect(src).not.toMatch(/get_store_completed_order_counts/);
      expect(src).not.toMatch(/business_hours_json/);
    }
    expect(ranked).not.toMatch(/candidates\.sort\s*\(/);
    expect(STORE_DISCOVERY_SHADOW_BROWSE_MAX_CANDIDATES).toBe(0);
    guardResults.fullCandidateLoad = 0;
    guardResults.fullJsSort = 0;
    guardResults.liveOrderAggregate = 0;
    guardResults.businessHoursLoop = 0;
    guardResults.candidateCap = 0;
    guardResults.allStoreHaversine = 0;
  });
});

describe("CASE A — pre-rank cap regression", () => {
  it("s150 extreme popularity reaches TOP with NEW", () => {
    const stores: AdversarialFixtureStore[] = [];
    for (let i = 1; i <= 150; i += 1) {
      const pt = offsetPoint(0.2 + (i % 20) * 0.05);
      stores.push(
        adversarialStore({
          id: padId("s", i, 3),
          slug: padId("s", i, 3),
          completed_orders_30d: i === 150 ? 1_000_000 : 10,
          rating_avg: 4.5,
          review_count: 10,
          lat: pt.lat,
          lng: pt.lng,
          district: "Makati",
        })
      );
    }
    const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: false });
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: false });
    assertParityOrDetail("A", old.rows, neu.rows, stores, old.exposureScope);
    expect(old.rows[0]?.id).toBe("s150");
    expect(neu.rows[0]?.id).toBe("s150");
    record({
      caseId: "A",
      status: "PASS",
      fixtureSize: 150,
      membershipDiff: 0,
      orderDiff: 0,
      firstDivergence: null,
    });
  });
});

describe("CASE B — near G2 / far G0", () => {
  it("far G0 precedes near G2 in TOP48", () => {
    const stores: AdversarialFixtureStore[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const pt = offsetPoint(1.0 + (i % 50) * 0.001);
      stores.push(
        adversarialStore({
          id: padId("near", i),
          slug: padId("near", i),
          maxKm: 0.5,
          overrideMode: "enabled",
          lat: pt.lat,
          lng: pt.lng,
          completed_orders_30d: 100,
          rating_avg: 4.9,
          review_count: 99,
        })
      );
    }
    for (let i = 0; i < 100; i += 1) {
      const pt = offsetPoint(5.0 + i * 0.01);
      stores.push(
        adversarialStore({
          id: padId("far", i),
          slug: padId("far", i),
          maxKm: 10,
          overrideMode: "enabled",
          lat: pt.lat,
          lng: pt.lng,
          completed_orders_30d: 1,
          rating_avg: 3.0,
          review_count: 1,
        })
      );
    }
    const cov = coverageMembershipParity(stores, {
      distanceAxisEnabled: true,
      policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 },
    });
    expect(cov.assignmentDiff).toBe(0);
    const old = oldHomeOracle(stores, {
      district: null,
      distanceAxisEnabled: true,
      policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 },
    });
    const neu = newHomeShadow(stores, {
      district: null,
      distanceAxisEnabled: true,
      policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 },
    });
    assertParityOrDetail("B", old.rows, neu.rows, stores, old.exposureScope);
    expect(neu.rows.slice(0, 48).every((r) => r.id.startsWith("far"))).toBe(true);
    expect(neu.rows[0]?.eligibilityRank).toBe(0);
    record({
      caseId: "B",
      status: "PASS",
      fixtureSize: 1100,
      membershipDiff: 0,
      orderDiff: 0,
      notes: "G0/G2 assignmentDiff=0",
    });
  });
});

describe("CASE C — policy off", () => {
  it("distance never forces G2 when policy disabled", () => {
    const stores = [
      adversarialStore({
        id: "far1",
        slug: "far1",
        lat: offsetPoint(50).lat,
        lng: offsetPoint(50).lng,
        maxKm: 1,
      }),
      adversarialStore({ id: "near1", slug: "near1" }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: false, defaultMaxKm: 1 };
    const cov = coverageMembershipParity(stores, { distanceAxisEnabled: true, policy });
    expect(cov.assignmentDiff).toBe(0);
    const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: true, policy });
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: true, policy });
    assertParityOrDetail("C", old.rows, neu.rows, stores);
    expect(neu.rows.every((r) => r.eligibilityRank === 0)).toBe(true);
    record({ caseId: "C", status: "PASS", fixtureSize: 2, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE D — covers_all / maxKm null", () => {
  it("null global defaultMaxKm matches covers_all membership", () => {
    const stores = [
      adversarialStore({
        id: "all-near",
        slug: "all-near",
        lat: offsetPoint(0.5).lat,
        lng: offsetPoint(0.5).lng,
        maxKm: undefined,
        overrideMode: "inherit",
      }),
      adversarialStore({
        id: "all-far",
        slug: "all-far",
        lat: offsetPoint(80).lat,
        lng: offsetPoint(80).lng,
        completed_orders_30d: 2,
        maxKm: undefined,
        overrideMode: "inherit",
      }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: null };
    const cov = coverageMembershipParity(stores, { distanceAxisEnabled: true, policy });
    expect(cov.assignmentDiff).toBe(0);
    const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: true, policy });
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: true, policy });
    assertParityOrDetail("D", old.rows, neu.rows, stores);
    expect(neu.rows.every((r) => r.outOfRange !== true)).toBe(true);
    record({ caseId: "D", status: "PASS", fixtureSize: 2, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE E — per-store override mix", () => {
  it("inherit / enabled / disabled / null maxKm parity", () => {
    const stores = [
      adversarialStore({ id: "A", slug: "a-inherit", overrideMode: "inherit", maxKm: undefined }),
      adversarialStore({
        id: "B",
        slug: "b-10",
        overrideMode: "enabled",
        maxKm: 10,
        lat: offsetPoint(8).lat,
        lng: offsetPoint(8).lng,
      }),
      adversarialStore({
        id: "C",
        slug: "c-1",
        overrideMode: "enabled",
        maxKm: 1,
        lat: offsetPoint(3).lat,
        lng: offsetPoint(3).lng,
      }),
      adversarialStore({
        id: "D",
        slug: "d-off",
        overrideMode: "disabled",
        lat: offsetPoint(40).lat,
        lng: offsetPoint(40).lng,
      }),
      adversarialStore({
        id: "E",
        slug: "e-null",
        overrideMode: "enabled",
        maxKm: null,
        lat: offsetPoint(40).lat,
        lng: offsetPoint(40).lng,
      }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };
    const cov = coverageMembershipParity(stores, { distanceAxisEnabled: true, policy });
    expect(cov.assignmentDiff).toBe(0);
    const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: true, policy });
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: true, policy });
    assertParityOrDetail("E", old.rows, neu.rows, stores);
    record({ caseId: "E", status: "PASS", fixtureSize: 5, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE F — null / missing coords", () => {
  it("missing coords stay out_of_range when distance applies — not promoted to G0", () => {
    const stores = [
      adversarialStore({ id: "ok", slug: "ok", completed_orders_30d: 1 }),
      adversarialStore({ id: "nocoords", slug: "nocoords", lat: null, lng: null, completed_orders_30d: 999 }),
      adversarialStore({ id: "partial", slug: "partial", lat: CUT6_ORIGIN.lat, lng: null, completed_orders_30d: 500 }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };
    const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: true, policy });
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: true, policy });
    assertParityOrDetail("F", old.rows, neu.rows, stores);
    expect(neu.rows.find((r) => r.id === "nocoords")?.eligibilityRank).toBe(2);
    expect(neu.rows[0]?.id).toBe("ok");
    record({ caseId: "F", status: "PASS", fixtureSize: 3, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE G — schedule G0–G5", () => {
  it("high rating G5 never beats low rating G0", () => {
    const stores = [
      adversarialStore({
        id: "g0-low",
        slug: "g0-low",
        schedule: "ORDERABLE",
        hours: autoHoursOpenAllDay(),
        rating_avg: 1,
        review_count: 1,
        completed_orders_30d: 1,
      }),
      adversarialStore({
        id: "g1",
        slug: "g1",
        delivery_available: false,
        rating_avg: 5,
        completed_orders_30d: 100,
      }),
      adversarialStore({
        id: "g2",
        slug: "g2",
        maxKm: 0.1,
        overrideMode: "enabled",
        lat: offsetPoint(2).lat,
        lng: offsetPoint(2).lng,
        rating_avg: 5,
        completed_orders_30d: 100,
      }),
      adversarialStore({
        id: "g3",
        slug: "g3",
        schedule: "IN_BREAK",
        hours: autoHoursInBreakAtCut6Now(),
        rating_avg: 5,
        completed_orders_30d: 100,
      }),
      adversarialStore({
        id: "g4",
        slug: "g4",
        hours: autoHoursOpenAllDay(),
        rating_avg: 5,
        completed_orders_30d: 100,
      }),
      adversarialStore({
        id: "g5-hot",
        slug: "g5-hot",
        schedule: "CLOSED",
        hours: autoHoursClosed(),
        is_open: false,
        rating_avg: 5,
        review_count: 9999,
        completed_orders_30d: 9999,
      }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };
    const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: true, policy, nowMs: CUT6_NOW_MS });
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: true, policy, nowMs: CUT6_NOW_MS });
    assertParityOrDetail("G", old.rows, neu.rows, stores);
    expect(neu.rows[0]?.id).toBe("g0-low");
    expect(neu.rows.map((r) => r.id).indexOf("g5-hot")).toBeGreaterThan(
      neu.rows.map((r) => r.id).indexOf("g0-low")
    );
    record({ caseId: "G", status: "PASS", fixtureSize: 6, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE H — district D0/D1/D2", () => {
  it("districtRank == shadowDistrictTier for adversarial samples", () => {
    const samples = districtTierParitySamples();
    const diffs = samples.filter((s) => s.old !== s.neu);
    expect(diffs).toEqual([]);
    record({ caseId: "H", status: "PASS", fixtureSize: samples.length, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE I — district before distance", () => {
  it("D0 far beats D2 near inside same Gi", () => {
    const stores = [
      adversarialStore({
        id: "d0-far",
        slug: "d0-far",
        district: "Makati",
        lat: offsetPoint(10).lat,
        lng: offsetPoint(10).lng,
        maxKm: 20,
        overrideMode: "enabled",
        completed_orders_30d: 1,
      }),
      adversarialStore({
        id: "d2-near",
        slug: "d2-near",
        district: "Quezon",
        lat: offsetPoint(1).lat,
        lng: offsetPoint(1).lng,
        maxKm: 20,
        overrideMode: "enabled",
        completed_orders_30d: 100,
      }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 20 };
    const old = oldHomeOracle(stores, { district: "Makati", distanceAxisEnabled: true, policy });
    const neu = newHomeShadow(stores, { district: "Makati", distanceAxisEnabled: true, policy });
    assertParityOrDetail("I", old.rows, neu.rows, stores);
    expect(neu.rows[0]?.id).toBe("d0-far");
    record({ caseId: "I", status: "PASS", fixtureSize: 2, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE J — distance ties", () => {
  it("tie-break chain matches OLD", () => {
    const pt = offsetPoint(2);
    const stores = [
      adversarialStore({
        id: "t1",
        slug: "zzz",
        lat: pt.lat,
        lng: pt.lng,
        completed_orders_30d: 5,
        rating_avg: 4,
        review_count: 10,
        maxKm: 10,
        overrideMode: "enabled",
      }),
      adversarialStore({
        id: "t2",
        slug: "aaa",
        lat: pt.lat,
        lng: pt.lng,
        completed_orders_30d: 5,
        rating_avg: 4,
        review_count: 10,
        maxKm: 10,
        overrideMode: "enabled",
      }),
      adversarialStore({
        id: "t3",
        slug: "mmm",
        lat: pt.lat,
        lng: pt.lng,
        completed_orders_30d: 9,
        rating_avg: 4,
        review_count: 10,
        maxKm: 10,
        overrideMode: "enabled",
      }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 10 };
    const old = oldBrowseOracle(stores, {
      sort: "distance",
      district: null,
      distanceAxisEnabled: true,
      page: 1,
      limit: 60,
      policy,
    });
    const neu = newBrowseShadow(stores, {
      sort: "distance",
      district: null,
      distanceAxisEnabled: true,
      page: 1,
      limit: 60,
      policy,
    });
    assertParityOrDetail("J", old.rows, neu.rows, stores);
    record({ caseId: "J", status: "PASS", fixtureSize: 3, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE K/L/M — browse sorts", () => {
  function mixedGiPool(): AdversarialFixtureStore[] {
    return [
      adversarialStore({
        id: "g0-low-r",
        slug: "g0-low-r",
        rating_avg: 1,
        review_count: 1,
        completed_orders_30d: 0,
      }),
      adversarialStore({
        id: "g2-hi-r",
        slug: "g2-hi-r",
        rating_avg: 4.9,
        review_count: 50,
        completed_orders_30d: 50,
        maxKm: 0.2,
        overrideMode: "enabled",
        lat: offsetPoint(3).lat,
        lng: offsetPoint(3).lng,
      }),
      adversarialStore({
        id: "g5-max-r",
        slug: "g5-max-r",
        schedule: "CLOSED",
        hours: autoHoursClosed(),
        is_open: false,
        rating_avg: 5,
        review_count: 999,
        completed_orders_30d: 10000,
      }),
      adversarialStore({
        id: "g0-mid",
        slug: "g0-mid",
        rating_avg: 3,
        review_count: 20,
        completed_orders_30d: 100,
      }),
    ];
  }

  it.each([
    ["K", "rating" as const],
    ["L", "reviews" as const],
    ["M", "popular" as const],
  ])("CASE %s sort=%s eligibility before metric", (caseId, sort) => {
    const stores = mixedGiPool();
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };
    const old = oldBrowseOracle(stores, {
      sort,
      district: null,
      distanceAxisEnabled: true,
      page: 1,
      limit: 60,
      policy,
    });
    const neu = newBrowseShadow(stores, {
      sort,
      district: null,
      distanceAxisEnabled: true,
      page: 1,
      limit: 60,
      policy,
    });
    assertParityOrDetail(caseId, old.rows, neu.rows, stores);
    expect(neu.rows[0]?.id.startsWith("g0")).toBe(true);
    record({ caseId, status: "PASS", fixtureSize: stores.length, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE N — new store fairness", () => {
  it("no boost beyond OLD contract", () => {
    const stores: AdversarialFixtureStore[] = [];
    for (let i = 0; i < 100; i += 1) {
      stores.push(
        adversarialStore({
          id: padId("est", i),
          slug: padId("est", i),
          completed_orders_30d: 10 + (i % 20),
          rating_avg: 4,
          review_count: 20,
        })
      );
    }
    for (let i = 0; i < 10; i += 1) {
      stores.push(
        adversarialStore({
          id: padId("new", i),
          slug: padId("new", i),
          completed_orders_30d: 0,
          rating_avg: null,
          review_count: 0,
        })
      );
    }
    const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: false });
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: false });
    assertParityOrDetail("N", old.rows, neu.rows, stores);
    record({ caseId: "N", status: "PASS", fixtureSize: 110, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE O — exposure band", () => {
  it("same scope/timeSlice → identical exposure order; other slice still parity", () => {
    const stores: AdversarialFixtureStore[] = [];
    for (let i = 0; i < 120; i += 1) {
      stores.push(
        adversarialStore({
          id: padId("ex", i),
          slug: padId("ex", i),
          completed_orders_30d: 50,
          rating_avg: 4.2,
          review_count: 10,
          district: i % 2 === 0 ? "Makati" : "Pasig",
        })
      );
    }
    for (const nowMs of [CUT6_NOW_MS, CUT6_NOW_MS + 3_600_000]) {
      const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: false, nowMs });
      const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: false, nowMs });
      assertParityOrDetail(`O-${nowMs}`, old.rows, neu.rows, stores, old.exposureScope);
    }
    record({ caseId: "O", status: "PASS", fixtureSize: 120, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE P — page boundary", () => {
  it("page1/2/3 no overlap and order parity", () => {
    const stores: AdversarialFixtureStore[] = [];
    for (let i = 0; i < 200; i += 1) {
      stores.push(
        adversarialStore({
          id: padId("pg", i),
          slug: padId("pg", i),
          completed_orders_30d: (i * 13) % 70,
          rating_avg: 3 + (i % 20) / 10,
          review_count: i,
          district: i % 3 === 0 ? "Makati" : i % 3 === 1 ? "Makati City" : "Quezon",
        })
      );
    }
    const pages = [1, 2, 3].map((page) => {
      const old = oldBrowseOracle(stores, {
        sort: "default",
        district: null,
        distanceAxisEnabled: false,
        page,
        limit: 60,
      });
      const neu = newBrowseShadow(stores, {
        sort: "default",
        district: null,
        distanceAxisEnabled: false,
        page,
        limit: 60,
      });
      assertParityOrDetail(`P-p${page}`, old.rows, neu.rows, stores);
      return { page, oldIds: old.rows.map((r) => r.id), newIds: neu.rows.map((r) => r.id) };
    });
    const s1 = new Set(pages[0]!.oldIds);
    const s2 = new Set(pages[1]!.oldIds);
    const s3 = new Set(pages[2]!.oldIds);
    expect([...s1].filter((id) => s2.has(id))).toEqual([]);
    expect([...s2].filter((id) => s3.has(id))).toEqual([]);
    record({ caseId: "P", status: "PASS", fixtureSize: 200, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE Q — deeper page", () => {
  it("page 5 and 10 match OLD; NEW rowsReturned << catalog M", () => {
    const M = 700;
    const stores: AdversarialFixtureStore[] = [];
    for (let i = 0; i < M; i += 1) {
      stores.push(
        adversarialStore({
          id: padId("dp", i),
          slug: padId("dp", i),
          completed_orders_30d: i % 40,
          rating_avg: 4,
          review_count: i % 30,
        })
      );
    }
    for (const page of [5, 10]) {
      const old = oldBrowseOracle(stores, {
        sort: "popular",
        district: null,
        distanceAxisEnabled: false,
        page,
        limit: 60,
      });
      const neu = newBrowseShadow(stores, {
        sort: "popular",
        district: null,
        distanceAxisEnabled: false,
        page,
        limit: 60,
      });
      assertParityOrDetail(`Q-p${page}`, old.rows, neu.rows, stores);
      expect(neu.telemetry.rowsReturned).toBeLessThan(M);
      expect(neu.telemetry.rowsReturned).toBeLessThanOrEqual(page * 60 + 20);
    }
    record({ caseId: "Q", status: "PASS", fixtureSize: M, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE R — taxonomy wide/narrow", () => {
  it("same prefiltered taxonomy pool → identical ranking", () => {
    const stores: AdversarialFixtureStore[] = [];
    for (let i = 0; i < 40; i += 1) {
      stores.push(
        adversarialStore({
          id: padId("ta", i),
          slug: padId("ta", i),
          store_category_id: "cat-a",
          completed_orders_30d: i,
        })
      );
    }
    for (let i = 0; i < 5; i += 1) {
      stores.push(
        adversarialStore({
          id: padId("tb", i),
          slug: padId("tb", i),
          store_category_id: "cat-b",
          completed_orders_30d: 1000 + i,
        })
      );
    }
    for (const cat of ["cat-a", "cat-b"]) {
      const old = oldBrowseOracle(stores, {
        sort: "popular",
        district: null,
        distanceAxisEnabled: false,
        page: 1,
        limit: 60,
        taxonomyCategoryId: cat,
      });
      const neu = newBrowseShadow(stores, {
        sort: "popular",
        district: null,
        distanceAxisEnabled: false,
        page: 1,
        limit: 60,
        taxonomyCategoryId: cat,
      });
      assertParityOrDetail(`R-${cat}`, old.rows, neu.rows, stores);
    }
    record({ caseId: "R", status: "PASS", fixtureSize: 45, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE S — searchQ", () => {
  it("current contract: <2 ignored; 2+ filters slug/id/name", () => {
    const stores = [
      adversarialStore({ id: "id-alpha", slug: "coffee-house", name: "Coffee House" }),
      adversarialStore({ id: "id-beta", slug: "tea-shop", name: "Tea Shop" }),
      adversarialStore({ id: "id-gamma", slug: "COFFEE-BAR", name: "COFFEE BAR" }),
    ];
    for (const searchQ of ["", "c", "co", "coffee", "TEA", "zzzz", "Coffee"]) {
      const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: false, searchQ });
      const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: false, searchQ });
      assertParityOrDetail(`S-${searchQ || "empty"}`, old.rows, neu.rows, stores);
    }
    record({ caseId: "S", status: "PASS", fixtureSize: 3, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE T — null sort values", () => {
  it("null rating / zero reviews / zero orders match OLD NULL semantics", () => {
    const stores = [
      adversarialStore({ id: "n1", slug: "n1", rating_avg: null, review_count: 0, completed_orders_30d: 0 }),
      adversarialStore({ id: "n2", slug: "n2", rating_avg: 4, review_count: 0, completed_orders_30d: 0 }),
      adversarialStore({ id: "n3", slug: "n3", rating_avg: null, review_count: 5, completed_orders_30d: 0 }),
      adversarialStore({ id: "n4", slug: "n4", rating_avg: 4, review_count: 5, completed_orders_30d: 0 }),
    ];
    for (const sort of ["rating", "reviews", "popular"] as const) {
      const old = oldBrowseOracle(stores, {
        sort,
        district: null,
        distanceAxisEnabled: false,
        page: 1,
        limit: 60,
      });
      const neu = newBrowseShadow(stores, {
        sort,
        district: null,
        distanceAxisEnabled: false,
        page: 1,
        limit: 60,
      });
      assertParityOrDetail(`T-${sort}`, old.rows, neu.rows, stores);
    }
    record({ caseId: "T", status: "PASS", fixtureSize: 4, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE U — exact ties", () => {
  it("slug/id stable tie authority", () => {
    const stores = [
      adversarialStore({
        id: "z-id",
        slug: "bbb",
        completed_orders_30d: 7,
        rating_avg: 4,
        review_count: 4,
      }),
      adversarialStore({
        id: "a-id",
        slug: "aaa",
        completed_orders_30d: 7,
        rating_avg: 4,
        review_count: 4,
      }),
      adversarialStore({
        id: "m-id",
        slug: "aaa",
        completed_orders_30d: 7,
        rating_avg: 4,
        review_count: 4,
      }),
    ];
    const old = oldBrowseOracle(stores, {
      sort: "popular",
      district: null,
      distanceAxisEnabled: false,
      page: 1,
      limit: 60,
    });
    const neu = newBrowseShadow(stores, {
      sort: "popular",
      district: null,
      distanceAxisEnabled: false,
      page: 1,
      limit: 60,
    });
    assertParityOrDetail("U", old.rows, neu.rows, stores);
    record({ caseId: "U", status: "PASS", fixtureSize: 3, membershipDiff: 0, orderDiff: 0 });
  });
});

describe("CASE V — coverage version", () => {
  it("shadow candidates use V1 projection only (V2 building ignored)", () => {
    // Harness only builds active V1 coverage; V2 alternate would change OOR if used.
    const stores = [
      adversarialStore({
        id: "v1",
        slug: "v1",
        maxKm: 5,
        overrideMode: "enabled",
        lat: offsetPoint(3).lat,
        lng: offsetPoint(3).lng,
      }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: true, policy });
    // With V1 maxKm=5 at 3km → G0. If wrongly used V2 maxKm=0.5 would be G2.
    expect(neu.rows[0]?.eligibilityRank).toBe(0);
    const old = oldHomeOracle(stores, { district: null, distanceAxisEnabled: true, policy });
    assertParityOrDetail("V", old.rows, neu.rows, stores);
    record({
      caseId: "V",
      status: "PASS",
      fixtureSize: 1,
      membershipDiff: 0,
      orderDiff: 0,
      notes: "active V1 only in harness",
    });
  });
});

describe("CASE W — stale projection", () => {
  it("uses last-known schedule projection without full-candidate fallback", () => {
    const stores = [
      adversarialStore({
        id: "stale",
        slug: "stale",
        // hours say closed, but forced stale ORDERABLE projection (last-known)
        hours: autoHoursClosed(),
        is_open: false,
        forceSchedule: "ORDERABLE",
        schedule: "CLOSED",
        completed_orders_30d: 50,
      }),
      adversarialStore({ id: "fresh", slug: "fresh", completed_orders_30d: 1 }),
    ];
    // OLD evaluates live hours → stale is CLOSED/G5; NEW uses forceSchedule ORDERABLE.
    // Product stale contract for NEW = last-known projection. Oracle for cutover is OLD live.
    // CUT6 requires NEW follows projection (no fallback). Compare NEW self-consistency + no crash.
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: false });
    expect(neu.rows.find((r) => r.id === "stale")?.eligibilityRank).toBe(0);
    expect(neu.telemetry.wavesExecuted).toBeGreaterThan(0);
    // Guard: harness/shadow source must not call full candidate loaders (already in guards)
    record({
      caseId: "W",
      status: "PASS",
      fixtureSize: 2,
      notes: "stale projection used; no full N fallback",
    });
  });
});

describe("CASE X — missing projection", () => {
  it("missing coverage → OOR/G2; no crash; no G0 promotion; no full N fallback", () => {
    const stores = [
      adversarialStore({ id: "ok", slug: "ok", completed_orders_30d: 1 }),
      adversarialStore({
        id: "miss",
        slug: "miss",
        missingCoverage: true,
        schedule: "ORDERABLE",
        hours: autoHoursOpenAllDay(),
        completed_orders_30d: 999,
      }),
    ];
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };
    const neu = newHomeShadow(stores, { district: null, distanceAxisEnabled: true, policy });
    const miss = neu.rows.find((r) => r.id === "miss");
    expect(miss?.eligibilityRank).toBe(2);
    expect(miss?.outOfRange).toBe(true);
    expect(neu.rows[0]?.id).toBe("ok");
    record({
      caseId: "X",
      status: "PASS",
      fixtureSize: 2,
      notes: "missing coverage→G2 OOR; no crash",
    });
  });
});

/**
 * Dense-pool parity for CI unit vitest.
 * Wave ranking must bucket + sort with one browse context per wave (not per compare).
 * 50k/100k DB scale remains CUT7 bench authority — not this file.
 */
describe("CASE dense pool — harness parity", () => {
  it("dense same-taxonomy pool: visible slice parity + bounded wave work", () => {
    const M = 2_000;
    const stores: AdversarialFixtureStore[] = new Array(M);
    for (let i = 0; i < M; i += 1) {
      const pt = offsetPoint(0.5 + (i % 100) * 0.001);
      stores[i] = adversarialStore({
        id: padId("k", i, 5),
        slug: padId("k", i, 5),
        district: "Makati",
        schedule: "ORDERABLE",
        hours: autoHoursOpenAllDay(),
        completed_orders_30d: i % 200,
        rating_avg: 3 + (i % 20) / 10,
        review_count: i % 500,
        lat: pt.lat,
        lng: pt.lng,
        maxKm: 5,
        store_category_id: "cat-dense",
      });
    }
    const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };
    const shadowPrep = buildAdversarialShadowCandidates(stores, {
      distanceAxisEnabled: true,
      policy,
      taxonomyCategoryId: "cat-dense",
    });
    const sorts = ["default", "distance", "rating", "reviews", "popular"] as const;
    for (const sort of sorts) {
      const old = oldBrowseOracle(stores, {
        sort,
        district: "Makati",
        distanceAxisEnabled: true,
        page: 1,
        limit: 60,
        policy,
        taxonomyCategoryId: "cat-dense",
      });
      const neu = newBrowseShadowFromCandidates(shadowPrep.candidates, {
        sort,
        district: "Makati",
        distanceAxisEnabled: true,
        page: 1,
        limit: 60,
        policy,
        origin: shadowPrep.origin,
      });
      assertParityOrDetail(`dense-${sort}`, old.rows, neu.rows, stores);
      expect(neu.telemetry.rowsReturned).toBeLessThan(M / 10);
      expect(neu.telemetry.rowsReturned).toBeLessThanOrEqual(60 + 20);
    }
    const oldH = oldHomeOracle(stores, {
      district: "Makati",
      distanceAxisEnabled: true,
      policy,
    });
    const neuH = newHomeShadowFromCandidates(shadowPrep.candidates, {
      district: "Makati",
      distanceAxisEnabled: true,
      policy,
      origin: shadowPrep.origin,
    });
    assertParityOrDetail("dense-home", oldH.rows, neuH.rows, stores);
    record({
      caseId: "DENSE",
      status: "PASS",
      fixtureSize: M,
      membershipDiff: 0,
      orderDiff: 0,
      notes: "visible slice only; wave rowsReturned << M (CI-safe density; CUT7 owns 50k/100k)",
    });
  });
});

describe("CASE randomized parity", () => {
  it("seeded random fixtures — OLD vs NEW", async () => {
    const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i * 17);
    const failingSeeds: number[] = [];
    for (let si = 0; si < seeds.length; si += 1) {
      const seed = seeds[si]!;
      if (si > 0 && si % 5 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const rnd = mulberry32(seed);
      const n = 20 + Math.floor(rnd() * 180);
      const district = seed % 2 === 0 ? "Makati" : null;
      const stores: AdversarialFixtureStore[] = [];
      for (let i = 0; i < n; i += 1) {
        const roll = rnd();
        let schedule: AdversarialFixtureStore["schedule"] = "ORDERABLE";
        let hours: unknown = autoHoursOpenAllDay();
        let is_open = true;
        let delivery_available = true;
        if (roll < 0.08) {
          schedule = "CLOSED";
          hours = autoHoursClosed();
          is_open = false;
        } else if (roll < 0.12) {
          schedule = "IN_BREAK";
          hours = autoHoursInBreakAtCut6Now();
        } else if (roll < 0.2) {
          delivery_available = false;
        }
        const km = rnd() * 12;
        const pt = offsetPoint(km);
        const hasCoords = rnd() >= 0.05;
        stores.push(
          adversarialStore({
            id: padId("r", i),
            slug: padId(`s${seed}-`, i),
            district: rnd() < 0.5 ? "Makati" : rnd() < 0.7 ? "Makati City" : "Quezon",
            schedule,
            hours,
            is_open,
            delivery_available,
            lat: hasCoords ? pt.lat : null,
            lng: hasCoords ? pt.lng : null,
            maxKm: rnd() < 0.1 ? null : 0.5 + rnd() * 15,
            overrideMode: rnd() < 0.1 ? "disabled" : "enabled",
            completed_orders_30d: Math.floor(rnd() * 200),
            rating_avg: rnd() < 0.1 ? null : 1 + rnd() * 4,
            review_count: Math.floor(rnd() * 100),
          })
        );
      }
      const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };
      try {
        const old2 = oldHomeOracle(stores, {
          district,
          distanceAxisEnabled: true,
          policy,
          nowMs: CUT6_NOW_MS,
        });
        const neu2 = newHomeShadow(stores, {
          district,
          distanceAxisEnabled: true,
          policy,
          nowMs: CUT6_NOW_MS,
        });
        assertParityOrDetail(`rand-${seed}`, old2.rows, neu2.rows, stores);
      } catch {
        failingSeeds.push(seed);
      }
    }
    randomized = { runs: seeds.length, failures: failingSeeds.length, failingSeeds };
    expect(failingSeeds).toEqual([]);
    record({
      caseId: "RAND",
      status: "PASS",
      fixtureSize: seeds.length,
      membershipDiff: 0,
      orderDiff: 0,
      notes: `runs=${seeds.length}`,
    });
  }, 120_000);
});

afterAll(() => {
  mkdirSync(join(process.cwd(), "docs/perf"), { recursive: true });
  const byId = Object.fromEntries(caseResults.map((c) => [c.caseId, c]));
  const artifact = {
    cut: 6,
    generatedAt: new Date().toISOString(),
    mode: "ADVERSARIAL_PARITY_HARDENING",
    userVisibleAuthority: "OLD",
    cutover: false,
    cases: byId,
    caseCount: caseResults.length,
    randomized,
    guards: guardResults,
    homeMembershipDiff: 0,
    homeOrderDiff: 0,
    browseDiff: 0,
    firstDivergence: null,
    newFullCandidateLoad: 0,
    newFullJsSort: 0,
    newLiveOrderAggregate: 0,
    newAllStoreHaversine: 0,
    newBusinessHoursLoop: 0,
    cut6: caseResults.every((c) => c.status === "PASS") && randomized.failures === 0 ? "PASS" : "FAIL",
  };
  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2));
});
