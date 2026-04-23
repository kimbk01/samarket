/**
 * `GlobalCommunityMessengerIncomingCall` 의 **HTTP 백업 폴링**(GET …/incoming?directOnly=1)만 게이트한다.
 *
 * - Realtime postgres_changes · Broadcast · SW 메시지 · visibility/focus burst 는 이 파일과 무관하게
 *   기존 컴포넌트에서 그대로 동작한다.
 * - `ringing` 직통 수신(direct callee) 중에는 **경로와 무관**하게 백업 폴링을 켠다(벨·종료 동기화).
 * - 그 외에는 메신저·통합 채팅 등 “수신 통화 UI가 뜰 수 있는 표면”에서만 주기적 GET 을 돌린다.
 *   (홈/커뮤니티/스토어 일반 피드 표면에서는 Realtime·Broadcast·SW 힌트만 사용)
 *
 * 폴링 간격 상수(`messenger-latency-config`)는 변경하지 않는다. 억제 구간만 긴 tail 간격을 쓴다.
 */

/** 백업 GET 을 쉬는 표면에서 타이머만 이어 갈 때의 간격(HTTP 호출 없음) */
export const INCOMING_CALL_BACKUP_HTTP_POLL_SUPPRESSED_TAIL_MS = 60_000;

function normalizePathname(pathname: string | null): string {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  return p.replace(/\/+$/, "") || "/";
}

function isIncomingCallBackupPollSurface(pathname: string): boolean {
  if (pathname === "/community-messenger" || pathname.startsWith("/community-messenger/")) return true;
  if (pathname === "/chats" || pathname.startsWith("/chats/")) return true;
  if (pathname === "/mypage/trade/chat" || pathname.startsWith("/mypage/trade/chat/")) return true;
  if (pathname === "/group-chat" || pathname.startsWith("/group-chat/")) return true;
  return false;
}

/**
 * @param pathname 현재 URL pathname
 * @param hasRingingDirectCallee `GlobalCommunityMessengerIncomingCall` 의 ringingDirectCalleeRef 와 동일 의미
 */
export function shouldRunIncomingCallBackupHttpPoll(
  pathname: string | null,
  hasRingingDirectCallee: boolean
): boolean {
  if (hasRingingDirectCallee) return true;
  const normalized = normalizePathname(pathname);
  if (!normalized || normalized === "/login" || normalized.startsWith("/login/")) return false;
  return isIncomingCallBackupPollSurface(normalized);
}
