import { isCallPushRoutePath, pathsMatchForPushConsume } from "@/lib/push/push-route-consume-contract";

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
 * - 승인된 절충: 이 창 안에서 같은 방의 새 알림을 다시 눌러도(주소가 그 방이 아니면) 이동하지 않는다.
 */
export const NON_CALL_PUSH_ROUTE_REDELIVERY_IGNORE_MS = 5_000;

/**
 * 원래 같은 경로 거르기 창(2초). 이 안의 중복은 원래대로 무시만 한다 —
 * 첫 이동이 아직 진행 중일 수 있고, 첫 이동의 ACK 는 `finalizePushRouteConsume` 가 경로 일치 뒤에 보낸다.
 */
export const PUSH_ROUTE_FIRST_NAVIGATION_IN_FLIGHT_MS = 2_000;

export type DeliveredPushRoute = { path: string; at: number };

/**
 * 방금 같은 경로로 실제 이동했으면 다시 온 이동(다른 알림 id·다시 넣은 경로 포함)을 무시한다(이동·ACK 없음).
 *
 * 예외 — 2초~5초 구간에서 현재 주소가 이미 그 경로(첫 이동 도착 뒤)이면 무시하지 않는다:
 * 리스너의 기존 「같은 경로」 분기(`same_route_ack`: 소비 표시·member A·ACK·트레이 제거)가 그대로 처리한다.
 * 주소가 아직 그 경로가 아니면 ACK 하지 않는다 — `finalizePushRouteConsume` 의 「경로 일치 전 보류 유지」를 지킨다.
 *
 * 통화 경로(`/community-messenger/calls/`)는 대상이 아니다 — 통화 거르기·ACK 는 기존 그대로.
 */
export function shouldIgnorePushRouteRedelivery(
  delivered: DeliveredPushRoute | null,
  path: string,
  now: number,
  currentPath: string
): boolean {
  if (!delivered || delivered.path !== path) return false;
  if (isCallPushRoutePath(path)) return false;
  const elapsed = now - delivered.at;
  if (elapsed >= NON_CALL_PUSH_ROUTE_REDELIVERY_IGNORE_MS) return false;
  if (elapsed >= PUSH_ROUTE_FIRST_NAVIGATION_IN_FLIGHT_MS && pathsMatchForPushConsume(currentPath, path)) {
    return false;
  }
  return true;
}
