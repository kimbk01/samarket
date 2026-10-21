/**
 * C-12 — `GET /api/community-messenger/calls/sessions/:id` 제한 키 = 사용자 + 세션.
 * (이전: 사용자당 1개 키 → 기기 여러 대·통화 여러 건 폴링이 한도를 공유해 429 → 종료 감지 지연)
 */
export function buildCallSessionGetRateLimitKey(userKey: string, sessionId: string): string {
  const sid = String(sessionId ?? "").trim().slice(0, 128) || "unknown";
  return `community-messenger:call-session-get:${userKey}:session:${sid}`;
}
