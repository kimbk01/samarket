/**
 * CONTRACT (Phase 4 Slice 4 — Store Point charge ratio SSOT):
 * - Store charge payment SSOT = STORE_POINT_CHARGE_PAYMENT_RATIO (local const)
 * - Separate from Member Rates (`point_plans` / rate_version)
 * - Create path snapshots payment_amount + point_amount on store_point_charge_requests
 * - Change ratio HERE only — DO NOT read Member point_plans for Store charges
 * - DO NOT Member↔Store transfer
 */
export const STORE_POINT_CHARGE_PAYMENT_RATIO = 1;

export function computeStorePointChargePaymentAmount(pointAmount: number): number {
  const points = Math.max(0, Math.floor(pointAmount));
  return Math.max(0, Math.floor(points * STORE_POINT_CHARGE_PAYMENT_RATIO));
}
