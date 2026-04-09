/** 내정보 **홈** (`/mypage`) — 취소·레거시 시트 등에서 사용 */
export const MYPAGE_MAIN_HREF = "/mypage" as const;

/**
 * 전역 1단 헤더 우측 **톱니** 및 계정·설정 “앱 설정 허브” 진입 — 설정 대메뉴 목록.
 * 예전 `?sheet=info` URL은 호환용으로만 유지합니다.
 */
export const MYPAGE_INFO_HUB_SHEET_PARAM = "sheet";
export const MYPAGE_INFO_HUB_SHEET_VALUE = "info";

export function buildMypageInfoHubHref(): string {
  return "/mypage/section/settings";
}

/** @deprecated 직접 문자열 대신 `buildMypageInfoHubHref()` 사용 권장 */
export const MYPAGE_INFO_HUB_PATH = buildMypageInfoHubHref();
