/** Store point top-up: payment amount derived from point amount (change ratio here later). */
export const STORE_POINT_CHARGE_PAYMENT_RATIO = 1;

export function computeStorePointChargePaymentAmount(pointAmount: number): number {
  const points = Math.max(0, Math.floor(pointAmount));
  return Math.max(0, Math.floor(points * STORE_POINT_CHARGE_PAYMENT_RATIO));
}
