/**
 * 광고 가격 저장 오타 방지 단일 정의 (광고 감사 D-13 · 2026-11-27).
 * - 상한: 회원 광고 포인트 1,000,000P · 매장 광고 ₱100,000 — 서버가 넘으면 `price_over_cap` 으로 거절
 * - 화면: 저장 확인에 「이전 → 새 금액 (×배수)」, 3배 이상 오르거나 1/3 이하로 내리면 한 번 더 확인
 * 쓰는 곳: 상위노출 가격(`/api/admin/member-promotion-products`) · 회원 배너 가격(`feed-ad-products`) · 매장 광고 가격(`delivery-ad-commercial-admin-writer`)
 */
export const AD_POINT_PRICE_CAP = 1_000_000;
/** ₱100,000 (센타보 단위) */
export const AD_PHP_PRICE_CAP_MINOR = 100_000 * 100;
/** 이 배수 이상 바뀌면 다시 확인 */
export const AD_PRICE_BIG_CHANGE_RATIO = 3;

export function isAdPointPriceOverCap(points: number): boolean {
  return Number.isFinite(points) && points > AD_POINT_PRICE_CAP;
}

export function isAdPhpPriceOverCap(minor: number): boolean {
  return Number.isFinite(minor) && minor > AD_PHP_PRICE_CAP_MINOR;
}

/** 새 금액 ÷ 이전 금액 — 이전 금액이 없거나 0 이면 null(비교 불가) */
export function adPriceChangeRatio(before: number | null | undefined, after: number): number | null {
  if (before == null || !Number.isFinite(before) || before <= 0 || !Number.isFinite(after) || after <= 0) return null;
  return after / before;
}

export function isBigAdPriceChange(before: number | null | undefined, after: number): boolean {
  const r = adPriceChangeRatio(before, after);
  if (r == null) return false;
  return r >= AD_PRICE_BIG_CHANGE_RATIO || r <= 1 / AD_PRICE_BIG_CHANGE_RATIO;
}

/** 「×2.5」 처럼 보여 줄 배수 (소수 1자리) */
export function formatAdPriceRatio(before: number | null | undefined, after: number): string | null {
  const r = adPriceChangeRatio(before, after);
  if (r == null) return null;
  return `×${(Math.round(r * 10) / 10).toString()}`;
}
