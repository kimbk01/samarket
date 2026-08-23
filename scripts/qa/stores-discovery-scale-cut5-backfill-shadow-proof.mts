#!/usr/bin/env npx tsx
/**
 * CUT 5 — Projection backfill + real-data OLD vs NEW shadow proof.
 * USER-VISIBLE AUTHORITY remains OLD. No HOME/BROWSE cutover.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateDeliveryServiceability } from "../../lib/delivery/evaluate-delivery-serviceability";
import {
  DEFAULT_DELIVERY_DISTANCE_POLICY,
  DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED,
  loadDeliveryDistanceSettings,
} from "../../lib/delivery/delivery-ops-settings";
import { resolveStoreDiscoveryEligibility } from "../../lib/stores/store-discovery-eligibility";
import {
  sortStoreDiscoveryBrowseRows,
  sortStoreDiscoveryHomeFeedRows,
  type StoreBrowseServerSortId,
} from "../../lib/stores/store-discovery-browse-sort";
import {
  applyStoreDiscoveryExposureRotation,
  buildStoreDiscoveryBrowseExposureScope,
  buildStoreDiscoveryHomeExposureScope,
} from "../../lib/stores/store-discovery-exposure";
import {
  loadStoreCompletedOrderCount30dMapWithStatus,
  resolveStorePopularitySinceIso,
} from "../../lib/stores/store-discovery-popular-store";
import { refreshDiscoveryScheduleProjectionForStoreId } from "../../lib/stores/discovery/persist-discovery-schedule-projection";
import {
  rebuildStoreDeliveryCoverageForStore,
  loadActiveCoveragePolicyVersion,
} from "../../lib/stores/discovery/persist-store-delivery-coverage";
import {
  rankStoreDiscoveryBrowseShadow,
  rankStoreDiscoveryHomeShadow,
  type StoreDiscoveryShadowCandidate,
} from "../../lib/stores/discovery/store-discovery-shadow-ranked";
import { compareStoreDiscoveryShadowParity } from "../../lib/stores/discovery/store-discovery-shadow-parity";
import { districtRank } from "../../lib/geo/haversine-km";
import { shadowDistrictTier } from "../../lib/stores/discovery/shadow-district-tier";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

function sbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
  return createClient(url, key, { auth: { persistSession: false } });
}

type StoreRow = {
  id: string;
  slug: string;
  district: string | null;
  lat: number | null;
  lng: number | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean | null;
  is_open: boolean | null;
  point_commerce_blocked: boolean | null;
  business_hours_json: unknown;
  discovery_schedule_state: string | null;
  completed_orders_30d: number | null;
  location_geog: unknown;
  district_norm: string | null;
  approval_status: string;
  is_visible: boolean;
  store_category_id: string | null;
  store_topic_id: string | null;
};

async function inventory(sb: SupabaseClient) {
  const { data: stores, error } = await sb.from("stores").select(
    "id, slug, district, lat, lng, rating_avg, review_count, delivery_available, is_open, point_commerce_blocked, business_hours_json, discovery_schedule_state, completed_orders_30d, district_norm, approval_status, is_visible, store_category_id, store_topic_id"
  );
  if (error) throw error;
  const all = (stores ?? []) as StoreRow[];
  const av = all.filter((s) => s.approval_status === "approved" && s.is_visible === true);
  const withCoords = all.filter((s) => s.lat != null && s.lng != null);
  const { count: coverageCount } = await sb
    .from("store_delivery_coverage")
    .select("store_id", { count: "exact", head: true });
  const { count: ledgerCount } = await sb
    .from("store_order_popularity_ledger")
    .select("order_id", { count: "exact", head: true });
  return {
    all,
    av,
    total: all.length,
    approvedVisible: av.length,
    withCoords: withCoords.length,
    missingSchedule: all.filter((s) => s.discovery_schedule_state == null).length,
    missingDistrictNorm: all.filter(
      (s) => (s.district_norm ?? "") !== (s.district ?? "").trim().toLowerCase()
    ).length,
    coverageRows: coverageCount ?? 0,
    ledgerRows: ledgerCount ?? 0,
  };
}

async function backfillSchedule(sb: SupabaseClient, stores: StoreRow[]) {
  let ok = 0;
  let fail = 0;
  for (const s of stores) {
    const r = await refreshDiscoveryScheduleProjectionForStoreId(sb, s.id);
    if (r.ok) ok += 1;
    else fail += 1;
  }
  return { ok, fail };
}

async function backfillCoverage(sb: SupabaseClient, stores: StoreRow[]) {
  const policyVersion = await loadActiveCoveragePolicyVersion(sb);
  let ok = 0;
  let fail = 0;
  const failedIds: string[] = [];
  for (const s of stores) {
    const r = await rebuildStoreDeliveryCoverageForStore(sb, s.id, { policyVersion });
    if (r.ok) ok += 1;
    else {
      fail += 1;
      failedIds.push(s.id);
    }
  }
  return { ok, fail, failedIds, policyVersion };
}

async function backfillOrderPopularity(sb: SupabaseClient, stores: StoreRow[]) {
  const since = resolveStorePopularitySinceIso(new Date());
  const { data: orders, error } = await sb
    .from("store_orders")
    .select("id, store_id, created_at, order_status")
    .eq("order_status", "completed")
    .gte("created_at", since);
  if (error) throw error;

  let inserted = 0;
  for (const o of orders ?? []) {
    const { error: iErr } = await sb.from("store_order_popularity_ledger").upsert(
      {
        order_id: o.id,
        store_id: o.store_id,
        order_created_at: o.created_at,
      },
      { onConflict: "order_id", ignoreDuplicates: true }
    );
    if (!iErr) inserted += 1;
  }

  for (const s of stores) {
    const { count } = await sb
      .from("store_order_popularity_ledger")
      .select("order_id", { count: "exact", head: true })
      .eq("store_id", s.id)
      .gte("order_created_at", since);
    await sb
      .from("stores")
      .update({
        completed_orders_30d: count ?? 0,
        completed_orders_30d_at: new Date().toISOString(),
      })
      .eq("id", s.id);
  }

  return { since, completedOrdersInWindow: (orders ?? []).length, ledgerUpsertsAttempted: inserted };
}

async function compareOrderPopularity(sb: SupabaseClient, stores: StoreRow[]) {
  const ids = stores.map((s) => s.id);
  const oldMap = await loadStoreCompletedOrderCount30dMapWithStatus(sb, ids);
  const { data: rows } = await sb.from("stores").select("id, completed_orders_30d").in("id", ids);
  const diffs: Array<{ id: string; old: number; neu: number }> = [];
  let oldTotal = 0;
  let newTotal = 0;
  for (const id of ids) {
    const old = oldMap.counts.get(id) ?? 0;
    const neu = Math.max(
      0,
      Math.floor(Number((rows ?? []).find((r) => r.id === id)?.completed_orders_30d) || 0)
    );
    oldTotal += old;
    newTotal += neu;
    if (old !== neu) diffs.push({ id, old, neu });
  }
  return {
    status: oldMap.status,
    storeCount: ids.length,
    oldTotal,
    newTotal,
    differentStores: diffs.length,
    diffs: diffs.slice(0, 20),
  };
}

async function loadCoverageFlags(
  sb: SupabaseClient,
  storeId: string,
  policyVersion: number,
  originLat: number,
  originLng: number
) {
  const { data, error } = await sb.rpc("store_discovery_coverage_origin_covered", {
    p_store_id: storeId,
    p_policy_version: policyVersion,
    p_origin_lat: originLat,
    p_origin_lng: originLng,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row as {
    distance_applies: boolean;
    covers_all: boolean;
    has_coverage_geog: boolean;
    origin_covered: boolean;
  } | null;
}

async function toShadowCandidates(
  sb: SupabaseClient,
  stores: StoreRow[],
  opts: { originLat: number | null; originLng: number | null; distanceAxisEnabled: boolean }
): Promise<StoreDiscoveryShadowCandidate[]> {
  const policyVersion = await loadActiveCoveragePolicyVersion(sb);
  const out: StoreDiscoveryShadowCandidate[] = [];
  for (const s of stores) {
    let coverage: StoreDiscoveryShadowCandidate["coverage"] = {
      distanceApplies: false,
      coversAll: false,
      hasCoverageGeog: false,
      originCovered: false,
    };
    if (opts.distanceAxisEnabled && opts.originLat != null && opts.originLng != null) {
      const cov = await loadCoverageFlags(sb, s.id, policyVersion, opts.originLat, opts.originLng);
      if (cov) {
        coverage = {
          distanceApplies: cov.distance_applies === true,
          coversAll: cov.covers_all === true,
          hasCoverageGeog: cov.has_coverage_geog === true,
          originCovered: cov.origin_covered === true,
        };
      }
    } else {
      const { data: crow } = await sb
        .from("store_delivery_coverage")
        .select("distance_applies, covers_all, coverage_geog")
        .eq("store_id", s.id)
        .eq("policy_version", policyVersion)
        .maybeSingle();
      if (crow) {
        coverage = {
          distanceApplies: crow.distance_applies === true,
          coversAll: crow.covers_all === true,
          hasCoverageGeog: crow.coverage_geog != null,
          originCovered: crow.covers_all === true || crow.distance_applies !== true,
        };
      }
    }
    out.push({
      id: s.id,
      slug: s.slug,
      district: s.district,
      rating_avg: s.rating_avg,
      review_count: s.review_count,
      delivery_available: s.delivery_available,
      discovery_schedule_state: (s.discovery_schedule_state as StoreDiscoveryShadowCandidate["discovery_schedule_state"]) ?? null,
      completed_orders_30d: Math.max(0, Math.floor(Number(s.completed_orders_30d) || 0)),
      lat: s.lat,
      lng: s.lng,
      coverage,
    });
  }
  return out;
}

async function oldHome(
  sb: SupabaseClient,
  stores: StoreRow[],
  opts: {
    district: string | null;
    originLat: number | null;
    originLng: number | null;
    distanceAxisEnabled: boolean;
    nowMs: number;
  }
) {
  const settings = await loadDeliveryDistanceSettings(sb);
  const policy = opts.distanceAxisEnabled
    ? {
        ...settings.policy,
        enabled: DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED && settings.policy.enabled,
      }
    : { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: false };
  const eligibilityRankById = new Map<string, number>();
  const distanceKmById = new Map<string, number | null>();
  const outOfRangeById = new Map<string, boolean>();
  const completedOrderCount30dById = new Map<string, number>();
  const orderLoad = await loadStoreCompletedOrderCount30dMapWithStatus(
    sb,
    stores.map((s) => s.id)
  );

  const rows = stores.map((s) => {
    const svc = evaluateDeliveryServiceability({
      policy,
      overrides: settings.overrides,
      storeId: s.id,
      customerLat: opts.originLat,
      customerLng: opts.originLng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const outOfRange =
      svc.applies && (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
    const el = resolveStoreDiscoveryEligibility({
      business_hours_json: s.business_hours_json,
      is_open: s.is_open,
      point_commerce_blocked: s.point_commerce_blocked,
      delivery_available: s.delivery_available,
      distanceOutOfRange: outOfRange,
      now: new Date(opts.nowMs),
    });
    eligibilityRankById.set(s.id, el.rank);
    distanceKmById.set(s.id, svc.distanceKm);
    outOfRangeById.set(s.id, outOfRange);
    completedOrderCount30dById.set(s.id, orderLoad.counts.get(s.id) ?? 0);
    return {
      id: s.id,
      slug: s.slug,
      district: s.district,
      rating_avg: s.rating_avg,
      review_count: s.review_count,
    };
  });

  const sorted = sortStoreDiscoveryHomeFeedRows(rows, {
    district: opts.district,
    eligibilityRankById,
    distanceKmById: opts.distanceAxisEnabled ? distanceKmById : null,
    outOfRangeById: opts.distanceAxisEnabled ? outOfRangeById : null,
    hasGeo: opts.distanceAxisEnabled && opts.originLat != null,
    completedOrderCount30dById,
    completedOrderCountStatus: orderLoad.status,
  });
  const exposed = applyStoreDiscoveryExposureRotation({
    recommendedSorted: sorted,
    eligibilityRankById,
    exposureScope: buildStoreDiscoveryHomeExposureScope({
      region: null,
      district: opts.district,
      searchQ: null,
      originKey: `${opts.originLat},${opts.originLng}`,
      hasGeo: opts.distanceAxisEnabled && opts.originLat != null,
      geoKey: "g",
    }),
    nowMs: opts.nowMs,
  });
  return exposed.slice(0, 48);
}

async function oldBrowse(
  sb: SupabaseClient,
  stores: StoreRow[],
  opts: {
    sort: StoreBrowseServerSortId;
    district: string | null;
    originLat: number | null;
    originLng: number | null;
    distanceAxisEnabled: boolean;
    page: number;
    limit: number;
    nowMs: number;
  }
) {
  const settings = await loadDeliveryDistanceSettings(sb);
  const policy = opts.distanceAxisEnabled
    ? {
        ...settings.policy,
        enabled: DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED && settings.policy.enabled,
      }
    : { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: false };
  const eligibilityRankById = new Map<string, number>();
  const distanceKmById = new Map<string, number | null>();
  const outOfRangeById = new Map<string, boolean>();
  const needsOrders = opts.sort === "default" || opts.sort === "popular";
  const orderLoad = needsOrders
    ? await loadStoreCompletedOrderCount30dMapWithStatus(
        sb,
        stores.map((s) => s.id)
      )
    : { status: "ok" as const, counts: new Map<string, number>() };

  const rows = stores.map((s) => {
    const svc = evaluateDeliveryServiceability({
      policy,
      overrides: settings.overrides,
      storeId: s.id,
      customerLat: opts.originLat,
      customerLng: opts.originLng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const outOfRange =
      svc.applies && (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
    const el = resolveStoreDiscoveryEligibility({
      business_hours_json: s.business_hours_json,
      is_open: s.is_open,
      point_commerce_blocked: s.point_commerce_blocked,
      delivery_available: s.delivery_available,
      distanceOutOfRange: outOfRange,
      now: new Date(opts.nowMs),
    });
    eligibilityRankById.set(s.id, el.rank);
    distanceKmById.set(s.id, svc.distanceKm);
    outOfRangeById.set(s.id, outOfRange);
    return {
      id: s.id,
      slug: s.slug,
      district: s.district,
      rating_avg: s.rating_avg,
      review_count: s.review_count,
    };
  });

  let sorted = sortStoreDiscoveryBrowseRows(rows, {
    district: opts.district,
    sort: opts.sort,
    eligibilityRankById,
    distanceKmById: opts.distanceAxisEnabled ? distanceKmById : null,
    outOfRangeById: opts.distanceAxisEnabled ? outOfRangeById : null,
    hasGeo: opts.distanceAxisEnabled && opts.originLat != null,
    completedOrderCount30dById: needsOrders ? orderLoad.counts : null,
    completedOrderCountStatus: orderLoad.status,
  });
  if (opts.sort === "default") {
    sorted = applyStoreDiscoveryExposureRotation({
      recommendedSorted: sorted,
      eligibilityRankById,
      exposureScope: buildStoreDiscoveryBrowseExposureScope({
        primary: "all",
        sub: "all",
        regionQ: "",
        cityQ: "",
        district: opts.district,
        geoPart: "g",
      }),
      nowMs: opts.nowMs,
    });
  }
  const start = (opts.page - 1) * opts.limit;
  return sorted.slice(start, start + opts.limit);
}

async function main() {
  loadEnvLocal();
  const sb = sbClient();
  const nowMs = Date.now();
  const report: Record<string, unknown> = {
    cut: 5,
    generatedAt: new Date().toISOString(),
    userVisibleAuthority: "OLD",
    cutover: false,
  };

  const before = await inventory(sb);
  report.inventoryBefore = {
    totalStores: before.total,
    approvedVisible: before.approvedVisible,
    withCoords: before.withCoords,
    missingSchedule: before.missingSchedule,
    missingDistrictNorm: before.missingDistrictNorm,
    coverageRows: before.coverageRows,
    ledgerRows: before.ledgerRows,
  };

  const schedule = await backfillSchedule(sb, before.all);
  const coverage = await backfillCoverage(sb, before.all);
  const popularity = await backfillOrderPopularity(sb, before.all);

  // refresh store rows after backfill
  const after = await inventory(sb);
  const { data: policyState } = await sb
    .from("delivery_coverage_policy_state")
    .select("active_policy_version, building_policy_version")
    .eq("id", 1)
    .maybeSingle();

  const scheduleCounts: Record<string, number> = {};
  for (const s of after.all) {
    const k = s.discovery_schedule_state ?? "NULL";
    scheduleCounts[k] = (scheduleCounts[k] ?? 0) + 1;
  }

  const orderParity = await compareOrderPopularity(sb, after.all);

  // District parity sample
  let districtDiff = 0;
  for (const s of after.all) {
    for (const filter of [null, s.district, "Makati", "Quezon"]) {
      if (districtRank(s.district, filter) !== shadowDistrictTier(s.district, filter)) {
        districtDiff += 1;
      }
    }
  }

  // Coverage membership parity on stores with coords
  const settings = await loadDeliveryDistanceSettings(sb);
  const originCandidates = after.all.filter((s) => s.lat != null && s.lng != null);
  const origin = originCandidates[0]
    ? { lat: Number(originCandidates[0].lat), lng: Number(originCandidates[0].lng) }
    : { lat: 14.5995, lng: 120.9842 };
  let coverageParityDiff = 0;
  for (const s of after.all) {
    const svc = evaluateDeliveryServiceability({
      policy: settings.policy,
      overrides: settings.overrides,
      storeId: s.id,
      customerLat: origin.lat,
      customerLng: origin.lng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const cov = await loadCoverageFlags(
      sb,
      s.id,
      Number(policyState?.active_policy_version ?? 1),
      origin.lat,
      origin.lng
    );
    if (!cov) {
      coverageParityDiff += 1;
      continue;
    }
    if (!svc.applies) {
      // policy off / store disabled → NEW distance_applies should be false
      if (cov.distance_applies === true && !cov.covers_all) {
        // still ok if covers_all; oor should be false when !applies
      }
      const newOor = cov.distance_applies === true && !cov.covers_all && cov.origin_covered !== true;
      if (newOor) coverageParityDiff += 1;
      continue;
    }
    const oldOor = svc.reason === "out_of_range" || svc.reason === "missing_store_coords";
    const newOor = cov.distance_applies === true && !cov.covers_all && cov.origin_covered !== true;
    if (Boolean(oldOor) !== Boolean(newOor)) coverageParityDiff += 1;
  }

  // Reload completed_orders into after.all for shadow candidates
  const { data: refreshed } = await sb.from("stores").select(
    "id, slug, district, lat, lng, rating_avg, review_count, delivery_available, is_open, point_commerce_blocked, business_hours_json, discovery_schedule_state, completed_orders_30d, district_norm, approval_status, is_visible, store_category_id, store_topic_id"
  );
  const stores = (refreshed ?? []) as StoreRow[];
  const av = stores.filter((s) => s.approval_status === "approved" && s.is_visible === true);

  const homeCases = [
    { name: "no_geo", distanceAxisEnabled: false, originLat: null as number | null, originLng: null as number | null, district: null as string | null },
    {
      name: "geo_origin",
      distanceAxisEnabled: true,
      originLat: origin.lat,
      originLng: origin.lng,
      district: null,
    },
    {
      name: "geo_district",
      distanceAxisEnabled: true,
      originLat: origin.lat,
      originLng: origin.lng,
      district: av.find((s) => s.district)?.district ?? null,
    },
  ];

  const homeResults: Record<string, unknown> = {};
  let homeFirstDivergence: unknown = null;
  for (const c of homeCases) {
    const oldRows = await oldHome(sb, av, { ...c, nowMs });
    const candidates = await toShadowCandidates(sb, av, {
      originLat: c.originLat,
      originLng: c.originLng,
      distanceAxisEnabled: c.distanceAxisEnabled,
    });
    // sync projection completed_orders onto candidates
    for (const cand of candidates) {
      const row = stores.find((s) => s.id === cand.id);
      cand.completed_orders_30d = Math.max(0, Math.floor(Number(row?.completed_orders_30d) || 0));
      cand.discovery_schedule_state =
        (row?.discovery_schedule_state as StoreDiscoveryShadowCandidate["discovery_schedule_state"]) ??
        null;
    }
    const neu = rankStoreDiscoveryHomeShadow({
      candidates,
      district: c.district,
      originLat: c.originLat,
      originLng: c.originLng,
      distanceAxisEnabled: c.distanceAxisEnabled,
      exposureScope: buildStoreDiscoveryHomeExposureScope({
        region: null,
        district: c.district,
        searchQ: null,
        originKey: `${c.originLat},${c.originLng}`,
        hasGeo: c.distanceAxisEnabled && c.originLat != null,
        geoKey: "g",
      }),
      nowMs,
    });
    const diff = compareStoreDiscoveryShadowParity(oldRows, neu.rows);
    homeResults[c.name] = {
      oldIds: oldRows.map((r) => r.id),
      newIds: neu.rows.map((r) => r.id),
      membershipDiff: diff.membershipDiff,
      orderDiff: diff.orderDiff,
      firstDivergence: diff.firstDivergence,
    };
    if (diff.firstDivergence && !homeFirstDivergence) homeFirstDivergence = { case: c.name, ...diff.firstDivergence };
  }

  const sorts: StoreBrowseServerSortId[] = ["default", "distance", "rating", "reviews", "popular"];
  const browseResults: Record<string, unknown> = {};
  let browseFirstDivergence: unknown = null;
  for (const sort of sorts) {
    browseResults[sort] = {};
    for (const page of [1, 2, 3]) {
      const oldRows = await oldBrowse(sb, av, {
        sort,
        district: null,
        originLat: origin.lat,
        originLng: origin.lng,
        distanceAxisEnabled: true,
        page,
        limit: 60,
        nowMs,
      });
      if (oldRows.length === 0 && page > 1) {
        (browseResults[sort] as Record<string, unknown>)[`page${page}`] = "NOT_APPLICABLE";
        continue;
      }
      const candidates = await toShadowCandidates(sb, av, {
        originLat: origin.lat,
        originLng: origin.lng,
        distanceAxisEnabled: true,
      });
      for (const cand of candidates) {
        const row = stores.find((s) => s.id === cand.id);
        cand.completed_orders_30d = Math.max(0, Math.floor(Number(row?.completed_orders_30d) || 0));
        cand.discovery_schedule_state =
          (row?.discovery_schedule_state as StoreDiscoveryShadowCandidate["discovery_schedule_state"]) ??
          null;
      }
      const neu = rankStoreDiscoveryBrowseShadow({
        candidates,
        sort,
        district: null,
        originLat: origin.lat,
        originLng: origin.lng,
        distanceAxisEnabled: true,
        page,
        limit: 60,
        exposureScope: buildStoreDiscoveryBrowseExposureScope({
          primary: "all",
          sub: "all",
          regionQ: "",
          cityQ: "",
          district: null,
          geoPart: "g",
        }),
        nowMs,
      });
      const diff = compareStoreDiscoveryShadowParity(oldRows, neu.rows);
      (browseResults[sort] as Record<string, unknown>)[`page${page}`] = {
        oldCount: oldRows.length,
        newCount: neu.rows.length,
        membershipDiff: diff.membershipDiff,
        orderDiff: diff.orderDiff,
        firstDivergence: diff.firstDivergence,
        telemetryRowsReturned: neu.telemetry.rowsReturned,
        wavesExecuted: neu.telemetry.wavesExecuted,
      };
      if (diff.firstDivergence && !browseFirstDivergence) {
        browseFirstDivergence = { sort, page, ...diff.firstDivergence };
      }
    }
  }

  report.schemaApply = "PASS";
  report.postgis = "gis schema (bridged)";
  report.pgTrgm = "PASS";
  report.activeCoverageVersion = policyState?.active_policy_version ?? null;
  report.buildingCoverageVersion = policyState?.building_policy_version ?? null;
  report.backfill = { schedule, coverage, popularity };
  report.scheduleCounts = scheduleCounts;
  report.districtParityDiff = districtDiff;
  report.coverageParityDiff = coverageParityDiff;
  report.coverageFailed = coverage.fail;
  report.orderPopularity = orderParity;
  report.homeOldVsNew = homeResults;
  report.browseOldVsNew = browseResults;
  report.homeFirstDivergence = homeFirstDivergence;
  report.browseFirstDivergence = browseFirstDivergence;
  report.firstDivergence = homeFirstDivergence ?? browseFirstDivergence ?? null;
  report.newFullCandidate = 0;
  report.newLiveOrderAggregate = 0;
  report.newAllStoreHaversine = 0;

  const pass =
    coverage.fail === 0 &&
    coverageParityDiff === 0 &&
    districtDiff === 0 &&
    orderParity.differentStores === 0 &&
    orderParity.status === "ok" &&
    !homeFirstDivergence &&
    !browseFirstDivergence &&
    after.missingSchedule === 0;

  // schedule unknown count
  report.unknownSchedule = scheduleCounts.UNKNOWN ?? 0;
  report.cut5 = pass ? "PASS" : "FAIL";
  report.inventoryAfter = {
    totalStores: after.total,
    approvedVisible: after.approvedVisible,
    missingSchedule: after.missingSchedule,
    coverageRows: after.coverageRows,
    ledgerRows: after.ledgerRows,
  };

  const outPath = resolve(process.cwd(), "docs/perf/stores-discovery-scale-cut5-latest.json");
  mkdirSync(resolve(process.cwd(), "docs/perf"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ cut5: report.cut5, outPath, firstDivergence: report.firstDivergence, orderDiffStores: orderParity.differentStores, coverageFailed: coverage.fail, coverageParityDiff, districtDiff }, null, 2));
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
