/** `/community-messenger/rooms/[roomId]` — URL path SSOT 파싱 */
export function parseCommunityMessengerRoomIdFromPathname(
  pathname: string | null | undefined
): string | null {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const m = p.match(/^\/community-messenger\/rooms\/([^/?#]+)/);
  const id = m?.[1]?.trim();
  return id || null;
}

export function isCommunityMessengerRoomRoutePathname(pathname: string | null | undefined): boolean {
  return parseCommunityMessengerRoomIdFromPathname(pathname) != null;
}
