/**
 * Supabase Realtime — 통화 관련 postgres_changes 테이블 식별자.
 * 웹·네이티브 공통으로 동일 채널/필터 패턴을 유지한다.
 */

export const COMMUNITY_MESSENGER_CALL_REALTIME = {
  sessionTable: "community_messenger_call_sessions",
  signalTable: "community_messenger_call_signals",
  participantTable: "community_messenger_call_session_participants",
} as const;

export type CommunityMessengerCallRealtimeTable =
  (typeof COMMUNITY_MESSENGER_CALL_REALTIME)[keyof typeof COMMUNITY_MESSENGER_CALL_REALTIME];
