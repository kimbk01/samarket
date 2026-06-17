import type { MyPageData } from "@/lib/my/types";

/** sessionStorage 시드·허브 state 가 현재 뷰어와 일치하는지 — 로그아웃 직후 stale UI 방지 */
export function isTrustedMypageHubProfile(
  profileId: string | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  const pid = profileId?.trim() ?? "";
  const vid = viewerId?.trim() ?? "";
  return pid.length > 0 && vid.length > 0 && pid === vid;
}

/** RSC initial + session 시드 중 현재 뷰어와 맞는 프로필이 있는 boot 행 */
export function resolveTrustedMypageBoot(
  initialMyPageData: MyPageData | null | undefined,
  sessionBoot: MyPageData | null | undefined,
  viewerId: string | null | undefined,
): MyPageData | null {
  const vid = viewerId?.trim() ?? "";
  if (!vid) return null;

  if (initialMyPageData !== undefined) {
    if (initialMyPageData && isTrustedMypageHubProfile(initialMyPageData.profile?.id, vid)) {
      return initialMyPageData;
    }
    return null;
  }

  if (sessionBoot && isTrustedMypageHubProfile(sessionBoot.profile?.id, vid)) {
    return sessionBoot;
  }
  return null;
}
