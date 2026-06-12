/**
 * BN12-B1 — `GlobalIncomingFriendRequestHost` idle defer (mypage·philife hub only).
 * notifications-rt 는 `MessagingGlobalChrome` — 이 정책과 분리.
 */

/** `/stores` idle chrome 과 동일 — cold parse 이후 idle 슬롯까지 최대 대기 */
export const GLOBAL_INCOMING_FRIEND_REQUEST_HOST_IDLE_DEFER_MS = 5000;

export function normalizeFriendRequestHostPathBase(pathname: string | null): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
}

/** `/community-messenger` — 친구·수신 popup 즉시 (idle defer 제외) */
export function isCommunityMessengerFriendRequestImmediateSurface(pathname: string | null): boolean {
  const p = normalizeFriendRequestHostPathBase(pathname);
  return p === "/community-messenger" || p.startsWith("/community-messenger/");
}

/**
 * social surface — 친구 요청 UX가 직접 연결된 경로 (즉시 mount).
 * `/philife` 허브 feed 는 defer 대상, `/philife/my` 등 프로필·소셜은 제외.
 */
export function isFriendRequestImmediateSocialSurface(pathname: string | null): boolean {
  const p = normalizeFriendRequestHostPathBase(pathname);
  if (p === "/community" || p.startsWith("/community/")) return true;
  if (p === "/philife/my" || p.startsWith("/philife/my/")) return true;
  return false;
}

/** `/mypage`·`/philife` 허브 계열 — idle defer 후보 */
export function isMypagePhilifeFriendRequestIdleDeferSurface(pathname: string | null): boolean {
  const p = normalizeFriendRequestHostPathBase(pathname);
  if (p === "/mypage" || p.startsWith("/mypage/")) return true;
  if (p === "/philife" || p.startsWith("/philife/")) return true;
  return false;
}

/**
 * true — host JSX·chunk load 를 idle 까지 미룸.
 * stores hub 는 layoutProfile gate(`storesHubLite`) 로 JSX 자체를 생략한다.
 */
export function shouldIdleDeferGlobalIncomingFriendRequestHost(pathname: string | null): boolean {
  if (isCommunityMessengerFriendRequestImmediateSurface(pathname)) return false;
  if (isFriendRequestImmediateSocialSurface(pathname)) return false;
  return isMypagePhilifeFriendRequestIdleDeferSurface(pathname);
}
