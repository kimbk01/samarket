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

/**
 * 첫 이동이 아직 진행 중일 수 있는 구간(원래 같은 경로 거르기 창 2초).
 * 이 안의 중복은 원래대로 ACK 하지 않는다 — 첫 이동의 ACK 는 `finalizePushRouteConsume` 가 경로 일치 뒤에 보낸다.
 */
export const PUSH_ROUTE_FIRST_NAVIGATION_IN_FLIGHT_MS = 2_000;

/**
 * 같은 경로 재주입 거르기 1곳. 무시했으면 true.
 * FAIL-3: 2초~5초 구간(이번에 늘어난 창)에서 무시한 재주입은 이동 없이 소비 처리(ACK)만 한다.
 * ACK 하지 않으면 네이티브가 그 경로를 계속 보류·재주입하고 60초 동안 저장해 다음 실행에 다시 보낸다
 * (실측 m7: 이전 알림 `e171e6ad` 는 5.01초 처리 때 `route_consumed` 로 네이티브 보류가 지워졌다).
 * 알림 id 소비 표시는 같은 경로 처리 분기(`same_route_ack`)와 같다. 통화 경로는 거르지도 ACK 하지도 않는다(불변).
 */
export function applyPushRouteRedeliveryGate(input: {
  delivered: DeliveredPushRoute | null;
  path: string;
  notificationId?: string;
  now: number;
  markConsumed: (notificationId: string | undefined) => void;
  ack: (path: string, notificationId?: string | null) => void;
}): boolean {
  const { delivered, path, notificationId, now } = input;
  if (!delivered || !shouldIgnorePushRouteRedelivery(delivered, path, now)) return false;
  if (now - delivered.at >= PUSH_ROUTE_FIRST_NAVIGATION_IN_FLIGHT_MS) {
    input.markConsumed(notificationId);
    input.ack(path, notificationId ?? null);
  }
  return true;
}
