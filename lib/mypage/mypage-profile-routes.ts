/** DIBAY 내정보 P0 — 프로필·수정은 `/mypage` 단일 페이지 */
export const MYPAGE_PROFILE_HREF = "/mypage" as const;
export const MYPAGE_PROFILE_EDIT_HREF = "/mypage" as const;
export const MYPAGE_REQUIRED_PHONE_HREF = "/mypage/required/phone" as const;
export const MYPAGE_REQUIRED_DIBAY_ID_HREF = "/mypage/required/dibay-id" as const;
/** 레거시 `/mypage/settings` 는 `/mypage` 로 리다이렉트 — 설정 홈은 내정보에 통합 */
export const MYPAGE_SETTINGS_HREF = "/mypage" as const;
export const MYPAGE_ADDRESSES_HREF = "/mypage/addresses" as const;

/** 내정보 홈(`/mypage`, 레거시 `/my`) — 하단 탭 여백을 본문에서만 처리 */
export function isMypageHomePath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage" || p === "/my";
}
