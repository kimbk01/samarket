/**
 * `GlobalCommunityMessengerIncomingCall` 의 **HTTP 백업 폴링**(GET …/incoming?directOnly=1)만 게이트한다.
 *
 * - Realtime postgres_changes · Broadcast · SW 메시지 · visibility/focus burst 는 이 파일과 무관하게
 *   기존 컴포넌트에서 그대로 동작한다.
 * - `ringing` 직통 수신(direct callee) 중에는 **경로와 무관**하게 백업 폴링을 켠다(벨·종료 동기화).
 * - 그 외에는 메신저·통합 채팅 등 “수신 통화 UI가 뜰 수 있는 표면”에서만 주기적 GET 을 돌린다.
 *
 * 폴링 간격 상수(`messenger-latency-config`)는 변경하지 않는다. 억제 구간만 긴 tail 간격을 쓴다.
 */

/** 백업 GET 을 쉬는 표면에서 타이머만 이어 갈 때의 간격(HTTP 호출 없음) */
export const INCOMING_CALL_BACKUP_HTTP_POLL_SUPPRESSED_TAIL_MS = 60_000;

/**
 * @param pathname 현재 URL pathname
 * @param hasRingingDirectCallee `GlobalCommunityMessengerIncomingCall` 의 ringingDirectCalleeRef 와 동일 의미
 */
export function shouldRunIncomingCallBackupHttpPoll(
  pathname: string | null,
  hasRingingDirectCallee: boolean
): boolean {
  if (hasRingingDirectCallee) return true;
  if (!pathname) return false;
  if (pathname.startsWith("/login")) return false;
  /**
   * "어느 도메인에 있든 수신 통화 알림이 떠야 한다"는 제품 요구에 맞춰
   * 로그인 화면을 제외한 전 표면에서 백업 HTTP 폴링을 허용한다.
   * (Realtime 신호 누락·무음 구독 시에도 수신 경로를 끊지 않음)
   */
  return true;
}
