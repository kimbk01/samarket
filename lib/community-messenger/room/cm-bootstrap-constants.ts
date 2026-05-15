/**
 * Bootstrap TTL·쿨다운 상수 — **다른 room 모듈 import 금지** (TDZ·순환 방지).
 * `cm-bootstrap-scheduling`·`cm-room-bootstrap-lock`·회귀 가드는 여기만 참조.
 */
export const CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS = 5_000;
export const CM_ROOM_PREFETCH_COOLDOWN_MS = 5_000;
