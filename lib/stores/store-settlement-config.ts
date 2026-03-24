/** 수수료: 만분율( basis points ). 300 = 3% */
export function getStoreSettlementFeeBp(): number {
  const raw = process.env.STORE_SETTLEMENT_FEE_BP;
  const n = raw != null ? parseInt(String(raw), 10) : 300;
  if (!Number.isFinite(n) || n < 0 || n > 10000) return 300;
  return n;
}

export function getStoreSettlementDelayDays(): number {
  const raw = process.env.STORE_SETTLEMENT_DELAY_DAYS;
  const n = raw != null ? parseInt(String(raw), 10) : 7;
  if (!Number.isFinite(n) || n < 0 || n > 365) return 7;
  return n;
}
