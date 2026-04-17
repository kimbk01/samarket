/**
 * `TradePresenceActivityProvider` 의 **HTTP heartbeat**(POST `/api/me/trade-presence/heartbeat`)만 게이트한다.
 *
 * - `sendBeacon` flush(`/api/me/trade-presence/beacon`)·`useTradeActivityCoordinator`·
 *   `useTradeMultiTabVisibilityOr` 는 이 파일과 무관(기존 컴포넌트에서 유지).
 * - `TRADE_PRESENCE_HEARTBEAT_INTERVAL_MS`(trade-presence-policy) 는 변경하지 않는다.
 *   비표면에서는 타이머만 긴 tail 로 이어 간다.
 */

export const TRADE_PRESENCE_HEARTBEAT_SUPPRESSED_TAIL_MS = 60_000;

/**
 * 거래 채팅·거래 허브 채팅·메신저 **1:1 방**(거래 도킹 가능) 표면에서만 주기적 POST 를 허용한다.
 * `/community/*` 피드·`/home`·일반 `/mypage/*`·메신저 목록 홈은 제외.
 */
export function shouldRunTradePresenceHttpHeartbeat(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/" || pathname === "/home") return false;
  if (pathname.startsWith("/home/")) return false;
  if (pathname.startsWith("/community")) return false;
  if (pathname.startsWith("/chats/") && pathname !== "/chats/new" && pathname !== "/chats/order") {
    return true;
  }
  if (pathname.startsWith("/mypage/trade/chat")) return true;
  if (pathname.startsWith("/community-messenger/rooms/")) return true;
  return false;
}
