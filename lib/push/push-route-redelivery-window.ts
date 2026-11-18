import { isCallPushRoutePath } from "@/lib/push/push-route-consume-contract";

/**
 * 같은 경로 「이미 이동함」 거르기 창 (통화 경로가 아닌 경로만).
 *
 * 근거 (FAIL-3, `docs/audit/messenger-chat-fail2-fail3-call-impact-analysis-2026-11-18.md` 10-2):
 * - Android `MainActivity.java` 는 채팅 경로를 웹 확인(ACK)까지 보류하고
 *   `PENDING_ROUTE_RETRY_DELAYS_MS = {120, 450, 900, 2000, 4000}` ms 로 다시 주입한다.
 *   보류 경로는 60초 동안 기기에 남아 다음 실행에도 같은 사다리로 다시 주입된다.
 * - 실측: 이전 알림(다른 알림 id) 재주입이 첫 이동 뒤 2.5초(m7)·2.75초(m4)에 와서
 *   옛 창(2초)을 통과 → ◁ 로 목록에 간 뒤 방이 다시 열렸다.
 * - 창 = 재시도 사다리 최대 4초 + 여유 1초.
 */
export const NON_CALL_PUSH_ROUTE_REDELIVERY_IGNORE_MS = 5_000;

export type DeliveredPushRoute = { path: string; at: number };

/**
 * 방금 같은 경로로 실제 이동했으면 다시 온 이동(다른 알림 id·다시 넣은 경로 포함)을 무시한다.
 * 통화 경로(`/community-messenger/calls/`)는 대상이 아니다 — 통화 거르기·ACK 는 기존 그대로.
 */
export function shouldIgnorePushRouteRedelivery(
  delivered: DeliveredPushRoute | null,
  path: string,
  now: number
): boolean {
  if (!delivered || delivered.path !== path) return false;
  if (isCallPushRoutePath(path)) return false;
  return now - delivered.at < NON_CALL_PUSH_ROUTE_REDELIVERY_IGNORE_MS;
}
