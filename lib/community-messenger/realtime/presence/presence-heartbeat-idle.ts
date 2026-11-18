/**
 * F1 (Owner 승인 2026-11-19) — presence HTTP 하트비트 유휴 정지 판정.
 *
 * 화면이 보이기만 하고 사람이 아무것도 하지 않으면 12초 하트비트(DB upsert)를 멈춘다.
 * 활동(터치·키·스크롤·화면 복귀·메시지 전송)이 생기면 즉시 1회 보내고 12초 주기로 돌아간다.
 * 활동 중인 사용자의 주기·신선도(푸시 억제 15초 · 온라인 30초)는 바꾸지 않는다.
 *
 * 근거: docs/audit/supabase-request-surge-2026-11-18/f1-presence-idle-heartbeat-design-2026-11-19.md
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
