/** 1:1 Agora 네트워크 재연결 — 단일 정책 */

export const AGORA_RECONNECT_MIN_MS = 3_000;
export const AGORA_RECONNECT_MAX_MS = 15_000;
export const AGORA_RECONNECT_ATTEMPT_MS = 6_000;

export const AGORA_NETWORK_ENDED_REASON = "network_disconnected";

/** 상대 `user-left` 직후 즉시 종료 대신 대기 — iOS 일시 끊김·재조인 여지 */
export const AGORA_PEER_LEFT_END_GRACE_MS = 8_000;

/** 수락 직후·첫 조인 구간 — `user-left` 오탐으로 발신 통화가 끊기지 않게 */
export const AGORA_PEER_LEFT_EARLY_CALL_GUARD_MS = 18_000;
