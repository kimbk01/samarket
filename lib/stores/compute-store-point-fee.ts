/** 매장 포인트 수수료 계산 — RPC compute_store_point_fee_amount 와 동일 산식 */

export type StorePointFeeMode = "fixed" | "percent" | "both";

export type StorePointPolicyLike = {
  fee_mode?: string | null;
  fixed_point?: number | null;
  percent_rate?: number | string | null;
  minimum_point?: number | null;
  maximum_point?: number | null;
};

function clampInt(n: unknown, min = 0): number {
  const v = Math.floor(Number(n) || 0);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, v);
}

function clampPercent(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export function computeStorePointFeeAmount(
  policy: StorePointPolicyLike | null | undefined,
  grossAmountPhp: number
): number {
  const mode = String(policy?.fee_mode ?? "fixed").trim() as StorePointFeeMode;
  const fixed = clampInt(policy?.fixed_point, 0);
  const pct = clampPercent(policy?.percent_rate);
  const minP = clampInt(policy?.minimum_point, 0);
  const maxP = clampInt(policy?.maximum_point, 0);
  const gross = clampInt(grossAmountPhp, 0);

  let total = 0;
  if (mode === "percent") {
    total = Math.min(gross, Math.floor((gross * pct) / 100));
  } else if (mode === "both") {
    const pctFee = Math.min(gross, Math.floor((gross * pct) / 100));
    total = fixed + pctFee;
  } else {
    total = fixed || 10;
  }

  if (minP > 0 && total < minP) total = minP;
  if (maxP > 0 && total > maxP) total = maxP;
  return Math.max(0, total);
}

/** 기본 fallback 정책 (DB seed 와 동일) */
export const DEFAULT_STORE_POINT_POLICY: StorePointPolicyLike = {
  fee_mode: "fixed",
  fixed_point: 10,
  percent_rate: 0,
  minimum_point: 0,
  maximum_point: 0,
};
