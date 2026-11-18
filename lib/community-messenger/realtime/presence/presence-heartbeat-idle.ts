/**
 * D1 2단계 — 손대지 않고 켜 둔 화면의 keepalive 정지 판정.
 * (F1 #483 은 전역 채널 정상 판정과 묶여 되돌렸다 — 2단계에서는 전역 채널이 없어 그 결함이 생기지 않는다.)
 *
 * 화면이 보이기만 하고 사람이 아무것도 하지 않으면 keepalive 를 멈춘다 → 판정 창(150초) 뒤 「마지막 접속」.
 * 활동(터치·키·스크롤·화면 복귀·메시지 전송)이 생기면 즉시 1회 보내고 주기로 돌아간다.
 */

/** 방 밖(목록 등) — 손대지 않은 지 5분이면 정지 */
export const PRESENCE_HEARTBEAT_IDLE_OUTSIDE_ROOM_MS = 5 * 60_000;
/** 방 안 — 터치 없이 대화를 읽는 경우를 보호해 30분 */
export const PRESENCE_HEARTBEAT_IDLE_IN_ROOM_MS = 30 * 60_000;

export function presenceHeartbeatIdleLimitMs(inRoom: boolean): number {
  return inRoom ? PRESENCE_HEARTBEAT_IDLE_IN_ROOM_MS : PRESENCE_HEARTBEAT_IDLE_OUTSIDE_ROOM_MS;
}

export function isPresenceHeartbeatIdle(args: {
  nowMs: number;
  lastActivityMs: number;
  inRoom: boolean;
}): boolean {
  if (!Number.isFinite(args.lastActivityMs) || args.lastActivityMs <= 0) return false;
  return args.nowMs - args.lastActivityMs >= presenceHeartbeatIdleLimitMs(args.inRoom);
}
