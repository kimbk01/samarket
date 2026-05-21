/**
 * 배달 오너 대시보드 API — `[owner-dashboard-perf-v2]` (관측 전용).
 * SLO·구조 락: docs/owner-dashboard-api-perf-lock.md
 */

import {
  detectOwnerDashboardPerfEnvironment,
  orderCountsColdLatencyKind,
  OWNER_DASHBOARD_LATENCY_SLO,
  type OwnerDashboardPerfEnvironment,
} from "@/lib/stores/owner-dashboard-api-perf-gate";

export type OwnerDashboardPerfV2Log = {
  route: string;
  total_ms: number;
  auth_ms?: number;
  ownership_ms?: number;
  store_lookup_ms?: number;
  unread_rpc_ms?: number;
  order_count_rpc_ms?: number;
  notification_count_ms?: number;
  cache_hit?: 0 | 1;
  singleflight_hit?: 0 | 1;
  first_paint_blocking?: boolean;
  worst_stage?: string;
  worst_stage_ms?: number;
  db_round_trips?: number;
  store_id?: string | null;
  fallback_used?: 0 | 1 | null;
  order_counts_via?: string | null;
  no_hub_fast_path?: 0 | 1;
  [key: string]: unknown;
};

function pickWorst(stages: Array<{ stage: string; ms: number }>): { worst_stage: string; worst_stage_ms: number } {
  let worst = { stage: "none", ms: 0 };
  for (const s of stages) {
    if (s.ms > worst.ms) worst = s;
  }
  return { worst_stage: worst.stage, worst_stage_ms: Math.round(worst.ms) };
}

export function buildOwnerDashboardPerfV2(
  input: OwnerDashboardPerfV2Log & {
    stages?: Array<{ stage: string; ms: number }>;
  }
): OwnerDashboardPerfV2Log {
  const stages = input.stages ?? [];
  const { worst_stage, worst_stage_ms } = pickWorst(stages);
  const { stages: _s, ...rest } = input;
  return { ...rest, worst_stage, worst_stage_ms };
}

let warnedRoutes = new Set<string>();
let structuralWarned = new Set<string>();

function perfV2ForLog(input: OwnerDashboardPerfV2Log): OwnerDashboardPerfV2Log {
  return JSON.parse(JSON.stringify(input, (_k, v) => (v === undefined ? null : v))) as OwnerDashboardPerfV2Log;
}

function collectOrderCountsStructuralFails(input: OwnerDashboardPerfV2Log): string[] {
  const fails: string[] = [];
  if (input.fallback_used === 1) fails.push("legacy_fallback_used");
  if (input.order_counts_via != null && input.order_counts_via !== "rpc_snapshot") {
    fails.push(`order_counts_via=${input.order_counts_via}`);
  }
  if (typeof input.db_round_trips === "number" && input.db_round_trips > 1) {
    fails.push(`db_round_trips=${input.db_round_trips}`);
  }
  const ownershipMs = Number(input.ownership_check_ms ?? input.ownership_ms ?? 0);
  const metaMs = Number(input.store_ops_meta_ms ?? 0);
  if (ownershipMs > 0) fails.push(`ownership_check_ms=${ownershipMs}`);
  if (metaMs > 0) fails.push(`store_ops_meta_ms=${metaMs}`);
  return fails;
}

function latencyThresholds(env: OwnerDashboardPerfEnvironment, route: string, cacheHit: boolean) {
  const slo = OWNER_DASHBOARD_LATENCY_SLO[env];
  if (route.includes("order-counts")) {
    return cacheHit ? slo.order_counts_warm_fail_ms : slo.order_counts_cold_fail_ms;
  }
  if (route.includes("/notifications")) {
    return cacheHit ? slo.notifications_warm_fail_ms : 150;
  }
  if (route.includes("store-owner-hub-badge")) {
    return cacheHit ? slo.hub_warm_fail_ms : 300;
  }
  return cacheHit ? 30 : 300;
}

function logStructuralRegression(route: string, fails: string[], input: OwnerDashboardPerfV2Log): void {
  const key = `${route}:${fails.join(",")}`;
  if (structuralWarned.has(key)) return;
  structuralWarned.add(key);
  // eslint-disable-next-line no-console -- structural perf lock
  console.error(
    `[owner-dashboard-perf-v2] structural regression ${JSON.stringify({
      route,
      environment: detectOwnerDashboardPerfEnvironment(),
      fails,
      total_ms: input.total_ms,
      cache_hit: input.cache_hit ?? 0,
      order_counts_via: input.order_counts_via,
      db_round_trips: input.db_round_trips,
      fallback_used: input.fallback_used,
    })}`
  );
}

function logRttLimited(route: string, totalMs: number, input: OwnerDashboardPerfV2Log): void {
  const key = `${route}:rtt:${totalMs}`;
  if (warnedRoutes.has(key)) return;
  warnedRoutes.add(key);
  // eslint-disable-next-line no-console -- local linked RTT band
  console.warn(
    `[owner-dashboard-perf-v2] rtt_limited ${JSON.stringify({
      route,
      environment: "local_linked",
      total_ms: totalMs,
      band_ms: "250-350",
      rpc_wall_ms: input.rpc_wall_ms,
      recommended_action:
        "measure on deployed same-region environment; do not tune SQL for linked RTT",
    })}`
  );
}

export function logOwnerDashboardPerfV2(input: OwnerDashboardPerfV2Log): void {
  const env = detectOwnerDashboardPerfEnvironment();
  const logPayload = { ...perfV2ForLog(input), perf_environment: env };
  // eslint-disable-next-line no-console -- JSON line for measure:owner-dashboard-api
  console.log(`[owner-dashboard-perf-v2] ${JSON.stringify(logPayload)}`);

  const route = input.route;
  const total = input.total_ms;
  const cacheHit = input.cache_hit === 1;
  const key = `${route}:${cacheHit ? "warm" : "cold"}:${env}`;

  if (route.includes("order-counts") && !cacheHit) {
    const structuralFails = collectOrderCountsStructuralFails(input);
    if (structuralFails.length) logStructuralRegression(route, structuralFails, input);
    if (env === "local_linked") {
      const kind = orderCountsColdLatencyKind(env, total);
      if (kind === "rtt_warn") logRttLimited(route, total, input);
    }
  }

  const threshold = latencyThresholds(env, route, cacheHit);
  let over = total > threshold;
  if (route.includes("order-counts") && !cacheHit && env === "local_linked") {
    over = orderCountsColdLatencyKind(env, total) === "fail";
  }

  if (over && !warnedRoutes.has(key)) {
    warnedRoutes.add(key);
    // eslint-disable-next-line no-console -- latency regression
    console.warn(
      `[owner-dashboard-perf-v2] baseline exceeded ${JSON.stringify({
        route,
        environment: env,
        total_ms: total,
        cache_hit: input.cache_hit ?? 0,
        threshold_ms: threshold,
        kind: "latency",
        worst_stage: input.worst_stage,
        worst_stage_ms: input.worst_stage_ms,
      })}`
    );
  }
}

export function resetOwnerDashboardPerfV2WarnsForTests(): void {
  warnedRoutes = new Set();
  structuralWarned = new Set();
}

/** @deprecated use OWNER_DASHBOARD_LATENCY_SLO */
export const OWNER_DASHBOARD_PERF_V2_BASELINE = {
  hub_badge_cold_ms: 300,
  hub_badge_warm_ms: 30,
  order_counts_cold_ms: 350,
  order_counts_warm_ms: 30,
  notifications_cold_ms: 150,
  notifications_warm_ms: 30,
} as const;
