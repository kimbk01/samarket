/**
 * 내정보(`/mypage`) 통합 허브 — 흩어진 계정·알림·앱 설정을 한 화면(모달 시트)에서 열람·이동.
 * 북마크·뒤로가기 호환용으로 URL 쿼리로 시트 오픈 상태를 공유합니다.
 */
export const MYPAGE_INFO_HUB_SHEET_PARAM = "sheet";
export const MYPAGE_INFO_HUB_SHEET_VALUE = "info";

export function buildMypageInfoHubHref(): string {
  const q = new URLSearchParams();
  q.set(MYPAGE_INFO_HUB_SHEET_PARAM, MYPAGE_INFO_HUB_SHEET_VALUE);
  return `/mypage?${q.toString()}`;
}

/** @deprecated 직접 문자열 대신 `buildMypageInfoHubHref()` 사용 권장 */
export const MYPAGE_INFO_HUB_PATH = buildMypageInfoHubHref();
