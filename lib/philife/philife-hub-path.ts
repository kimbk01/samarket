import { isCommunityHomeSurfacePath } from "@/lib/layout/resolve-main-surface";

/** Philife/Community 글로벌 피드 허브(SSOT `isCommunityHomeSurfacePath`) — 하단 탭 여백을 본문에서만 처리 */
export function isPhilifeFeedHubPath(pathname: string | null | undefined): boolean {
  if (!(pathname ?? "").split("?")[0]?.trim()) return false;
  return isCommunityHomeSurfacePath(pathname);
}
