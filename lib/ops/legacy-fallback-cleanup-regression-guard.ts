/**
 * LFC1 — `[legacy-cleanup-regression-alert]` when legacy paths reappear or snapshot-only contract breaks.
 */
export type LegacyCleanupRegressionAlertInput = {
  route: string;
  alert:
    | "fallback_branch_reintroduced"
    | "query_wave_2_ms_regression"
    | "rpc_removed_reverted"
    | "legacy_builder_invoked"
    | "reconnect_triggered_legacy"
    | "request_time_aggregate_detected"
    | "stale_overwrite_detected"
    | "duplicate_realtime_merge";
  detail?: string;
  query_wave_2_ms?: number;
  rpc_removed?: number;
  fallback_branch?: string;
};

function shouldLogLegacyCleanupRegression(): boolean {
  if (typeof process === "undefined") return true;
  return process.env.SAMARKET_LFC1_REGRESSION_ALERT?.trim() !== "0";
}

export function warnLegacyCleanupRegression(input: LegacyCleanupRegressionAlertInput): void {
  if (!shouldLogLegacyCleanupRegression()) return;
  const row = {
    route: input.route,
    alert: input.alert,
    detail: input.detail ?? null,
    query_wave_2_ms: input.query_wave_2_ms ?? null,
    rpc_removed: input.rpc_removed ?? null,
    fallback_branch: input.fallback_branch ?? null,
    at: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console -- LFC1 required regression output
  console.warn("[legacy-cleanup-regression-alert]", row);
}
