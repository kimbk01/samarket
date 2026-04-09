/**
 * 내정보(`/mypage`) 통합 설정 허브.
 * 상세 화면은 `/mypage?tab=settings&section=...` 기준으로 통일하고, 예전 `?sheet=info` URL은 호환용으로만 유지합니다.
 */
export const MYPAGE_INFO_HUB_SHEET_PARAM = "sheet";
export const MYPAGE_INFO_HUB_SHEET_VALUE = "info";

export function buildMypageInfoHubHref(): string {
  return "/mypage?tab=settings&section=service";
}

/** @deprecated 직접 문자열 대신 `buildMypageInfoHubHref()` 사용 권장 */
export const MYPAGE_INFO_HUB_PATH = buildMypageInfoHubHref();
