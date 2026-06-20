/** pathname only — query 제외 */
export function normalizeAppPathname(pathname: string | null | undefined): string {
  const trimmed = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
  return trimmed || "/";
}

export function isCommunityMessengerRoomPath(pathname: string | null | undefined): boolean {
  const p = normalizeAppPathname(pathname);
  return p.startsWith("/community-messenger/rooms/");
}

export function isCommunityMessengerCallPath(pathname: string | null | undefined): boolean {
  const p = normalizeAppPathname(pathname);
  return p.startsWith("/community-messenger/calls/");
}

/** 방·통화 등 메신저 deep route — 하단 탭 pending 패널·stale intent 차단 대상 */
export function isCommunityMessengerDeepRoutePath(pathname: string | null | undefined): boolean {
  return isCommunityMessengerRoomPath(pathname) || isCommunityMessengerCallPath(pathname);
}

export function pathFromClientHref(href: string): string {
  const raw = href.trim();
  const qIdx = raw.indexOf("?");
  return normalizeAppPathname(qIdx >= 0 ? raw.slice(0, qIdx) : raw);
}
