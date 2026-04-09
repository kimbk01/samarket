/**
 * 내정보 헤더 톱니바퀴 목적지 — 계층형 설정 목록(`/mypage/section/settings`).
 * 예전 `?sheet=info` URL은 호환용으로만 유지합니다.
 */
export const MYPAGE_INFO_HUB_SHEET_PARAM = "sheet";
export const MYPAGE_INFO_HUB_SHEET_VALUE = "info";

export function buildMypageInfoHubHref(): string {
  return "/mypage/section/settings";
}

/** @deprecated 직접 문자열 대신 `buildMypageInfoHubHref()` 사용 권장 */
export const MYPAGE_INFO_HUB_PATH = buildMypageInfoHubHref();
