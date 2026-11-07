/**
 * D-13 (재감사 3차 2026-11-07): 노출 1회 = 노출 id 1개.
 * 예전 팝업 노출 id 는 `캠페인:소재:조회 회차` 였다 — 조회 회차는 앱을 켤 때마다 1부터 다시 세므로 다른 실행·다른 사람과
 * 같은 값이 나오고, 같은 실행에서 다시 띄우면 값이 바뀐다(관찰된 impression `:1` · click `:2` 는 서로 다른 두 노출).
 * DB 부분 고유 인덱스(campaign_id, meta->>'exposureId', event_type)가 이 값을 쓰므로 노출마다 겹치지 않는 값이어야 한다.
 */
export function newPlatformPopupExposureId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}
