/** Philife 글로벌 피드 허브(`/philife`) — 하단 탭 여백을 본문에서만 처리 */
export function isPhilifeFeedHubPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/philife";
}
