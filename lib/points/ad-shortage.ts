/**
 * 광고하기 창(시안 v3 · Owner 2026-11-03 승인) — 상품 줄마다 고를 수 있는지·부족 포인트.
 * 가격은 서버 카탈로그 값(상위노출 = `member_promotion_products`, 배너 = `feed_ad_products`)만 받는다.
 */
export type AdOptionPrice = { pointCost: number };

/** 내 포인트로 살 수 있으면 0, 아니면 모자란 포인트. 잔액을 모르면(null) 가격 전체 */
export function adShortagePoints(price: number, balance: number | null): number {
  const p = Math.max(0, Math.floor(Number(price) || 0));
  if (balance == null || !Number.isFinite(balance)) return p;
  return Math.max(0, p - Math.max(0, Math.floor(balance)));
}

export function canAffordAd(price: number, balance: number | null): boolean {
  return balance != null && adShortagePoints(price, balance) === 0;
}

/**
 * 충전 상품 추천 — 부족분 이상(포인트+보너스)을 주는 가장 작은 활성 상품. 모두 모자라면 가장 큰 상품.
 * 상품 금액·포인트는 어드민 › 포인트 › 충전 상품(`point_plans`) 값.
 */
export function recommendChargePlanId<T extends { id: string; pointAmount: number; bonusPointAmount?: number | null; paymentAmount: number }>(
  plans: readonly T[],
  needPoints: number
): string | null {
  if (plans.length === 0) return null;
  const need = Math.max(0, Math.floor(Number(needPoints) || 0));
  const total = (p: T) => Math.max(0, p.pointAmount) + Math.max(0, p.bonusPointAmount ?? 0);
  const sorted = [...plans].sort((a, b) => a.paymentAmount - b.paymentAmount || total(a) - total(b));
  const enough = sorted.find((p) => total(p) >= need);
  return (enough ?? sorted[sorted.length - 1])!.id;
}
