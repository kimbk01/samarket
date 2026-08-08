/**
 * DEPRECATED for Delivery commission financial authority.
 * `store_settlement_fee_bp` / STORE_SETTLEMENT_FEE_BP are NOT fee SSOT.
 * Fee authority = store_fee_policies (store → topic → category → Platform Default).
 * Kept only as commerce_settings UI/config surface for unrelated ops (delay days still live).
 */
export function getStoreSettlementFeeBp(): number {
  const raw = process.env.STORE_SETTLEMENT_FEE_BP;
  if (raw == null || String(raw).trim() === "") return 0;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0 || n > 10000) return 0;
  return n;
}

export function getStoreSettlementDelayDays(): number {
  const raw = process.env.STORE_SETTLEMENT_DELAY_DAYS;
  const n = raw != null ? parseInt(String(raw), 10) : 7;
  if (!Number.isFinite(n) || n < 0 || n > 365) return 7;
  return n;
}
