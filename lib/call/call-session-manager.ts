/**
 * 클라이언트 통화 세션 — 서버 `community_messenger_call_sessions` + Realtime 가 단일 진실 원천(SSOT).
 * 로컬 미디어·세션 키 캐시는 `permission-manager` (`acquireCommunityMessengerWebRtcStream`, `migrate…`, `release…`).
 */

export const communityMessengerCallSessionClientDomain = "community_messenger_call" as const;
