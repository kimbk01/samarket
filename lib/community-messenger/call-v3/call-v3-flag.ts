/**
 * DIBAY Call V3 Safe Lane — feature flag.
 * ON: V3 orchestration only; legacy CallEngine incoming hosts are gated off.
 */
export function isDibayCallV3SafeLaneEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DIBAY_CALL_V3_SAFE_LANE === "1";
}
