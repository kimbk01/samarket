/** 픽업 가능/배송중 진입 후 며칠 뒤 자동 완료 처리할지 (1~90, 기본 7) */
export function getStoreAutoCompleteDays(): number {
  const raw = process.env.STORE_AUTO_COMPLETE_DAYS;
  const n = raw != null ? parseInt(String(raw), 10) : 7;
  if (!Number.isFinite(n) || n < 1) return 7;
  if (n > 90) return 90;
  return n;
}

/** days: 1~90 (호출 전에 클램프 권장) */
export function computeAutoCompleteAtIso(days: number): string {
  const safe = Math.min(90, Math.max(1, Math.round(days)));
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + safe);
  return d.toISOString();
}
