/**
 * 중고차 posts.meta.car_trade — 리스트·상세·어드민 공통 표시
 */

export function getCarTradeLabelKo(
  meta: Record<string, unknown> | null | undefined
): "삽니다" | "팝니다" | null {
  const ct = meta?.car_trade;
  if (ct === "buy") return "삽니다";
  if (ct === "sell") return "팝니다";
  return null;
}
