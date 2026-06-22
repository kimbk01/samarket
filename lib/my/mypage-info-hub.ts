/** 내정보 **홈** (`/mypage`) — 취소·레거시 시트 등에서 사용 */
export const MYPAGE_MAIN_HREF = "/mypage" as const;

/**
 * 레거시 앱 설정 허브 진입 — 햄버거 패널 제거 후 내정보 홈으로 통일.
 * 예전 `?sheet=info` URL은 `/mypage` 로 리다이렉트됩니다.
 */
export const MYPAGE_INFO_HUB_SHEET_PARAM = "sheet";
export const MYPAGE_INFO_HUB_SHEET_VALUE = "info";

export function buildMypageInfoHubHref(): string {
  return MYPAGE_MAIN_HREF;
}

/** @deprecated 직접 문자열 대신 `buildMypageInfoHubHref()` 사용 권장 */
export const MYPAGE_INFO_HUB_PATH = buildMypageInfoHubHref();
