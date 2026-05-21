/**
 * Owner dashboard perf gate — TS 소비(라우트 경고). 측정 SSOT: docs/owner-dashboard-api-perf-lock.md · scripts/owner-dashboard-api-perf-gate.mjs
 */

export type OwnerDashboardPerfEnvironment = "local_linked" | "prod_same_region" | "unknown";

export const OWNER_DASHBOARD_RPC_SERVER_SQL_MAX_MS = 20;

export const OWNER_DASHBOARD_LATENCY_SLO = {
  local_linked: {
    order_counts_cold_fail_ms: 350,
    order_counts_cold_rtt_warn_min_ms: 250,
    order_counts_warm_fail_ms: 30,
    hub_warm_fail_ms: 30,
    notifications_warm_fail_ms: 30,
  },
  prod_same_region: {
    order_counts_cold_fail_ms: 250,
    order_counts_cold_rtt_warn_min_ms: null as number | null,
    order_counts_warm_fail_ms: 20,
    hub_warm_fail_ms: 20,
    notifications_warm_fail_ms: 20,
  },
  unknown: {
    order_counts_cold_fail_ms: 350,
    order_counts_cold_rtt_warn_min_ms: 250,
    order_counts_warm_fail_ms: 30,
    hub_warm_fail_ms: 30,
    notifications_warm_fail_ms: 30,
  },
} as const;

export function detectOwnerDashboardPerfEnvironment(): OwnerDashboardPerfEnvironment {
  const forced = process.env.OWNER_DASHBOARD_PERF_ENV?.trim();
  if (forced === "local_linked" || forced === "prod_same_region") return forced;
  if (
    process.env.VERCEL === "1" ||
    process.env.SAMARKET_OWNER_DASHBOARD_PROD === "1" ||
    process.env.SAMARKET_DEPLOYMENT_SAME_REGION === "1"
  ) {
    return "prod_same_region";
  }
  return "local_linked";
}

export function orderCountsColdLatencyKind(
  env: OwnerDashboardPerfEnvironment,
  totalMs: number
): "ok" | "rtt_warn" | "fail" {
  const slo = OWNER_DASHBOARD_LATENCY_SLO[env];
  if (totalMs > slo.order_counts_cold_fail_ms) return "fail";
  if (
    slo.order_counts_cold_rtt_warn_min_ms != null &&
    totalMs > slo.order_counts_cold_rtt_warn_min_ms
  ) {
    return "rtt_warn";
  }
  return "ok";
}
