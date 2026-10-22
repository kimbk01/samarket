/**
 * DSC-06 · S3-04 — 배달 소비자 화면 「불러오기 실패」 vs 「없음(404·빈 목록)」 구분.
 *
 * 오류(재시도 노출): 네트워크 예외(status 0) · 408 · 429 · 5xx.
 * 그 외(200·4xx not_found 등)는 기존처럼 빈/없음 상태로 둔다 — 실제로 없는 매장·메뉴를 오류로 보이지 않게.
 * 표시는 공용 상태 화면 `MyStateView kind="error"` 하나만 쓴다.
 */
export function isDeliveryLoadErrorStatus(status: number): boolean {
  const s = Math.floor(Number(status));
  if (!Number.isFinite(s) || s <= 0) return true;
  if (s === 408 || s === 429) return true;
  return s >= 500;
}
