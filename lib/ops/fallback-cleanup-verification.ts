/**
 * LFC1 — per-route cleanup verification log `[fallback-cleanup-verification]`.
 */
export type FallbackCleanupVerificationRow = {
  route: string;
  fallback_removed: 0 | 1;
  verify_rpc_pass: 0 | 1;
  verify_e2e_pass: 0 | 1;
  reconnect_pass: 0 | 1;
  burst_pass: 0 | 1;
  stale_detected: 0 | 1;
  regression_alert_count: number;
  query_wave_2_ms: number;
  rpc_removed: 0 | 1;
  pass: 0 | 1;
  blocker?: string;
};

export function logFallbackCleanupVerification(row: FallbackCleanupVerificationRow): void {
  if (process.env.SAMARKET_LFC1_VERIFICATION_LOG?.trim() === "0") return;
  // eslint-disable-next-line no-console -- LFC1 required verification output
  console.log("[fallback-cleanup-verification]", row);
}

export function evaluateFallbackCleanupPass(row: Omit<FallbackCleanupVerificationRow, "pass">): FallbackCleanupVerificationRow {
  const pass: 0 | 1 =
    row.fallback_removed === 1 &&
    row.verify_rpc_pass === 1 &&
    row.verify_e2e_pass === 1 &&
    row.reconnect_pass === 1 &&
    row.burst_pass === 1 &&
    row.stale_detected === 0 &&
    row.regression_alert_count === 0 &&
    row.query_wave_2_ms === 0 &&
    row.rpc_removed === 1
      ? 1
      : 0;
  const full: FallbackCleanupVerificationRow = { ...row, pass };
  logFallbackCleanupVerification(full);
  return full;
}
