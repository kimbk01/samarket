/**
 * 통화·채팅방 타임라인 제품 정책 (카톡·텔레그램·Viber 계열).
 *
 * ## 방 타임라인 SSOT
 * - **SSOT**: `community_messenger_messages` rows where `message_type = 'call_stub'`
 * - **callId(sessionId) 당 논리 1행** — dialing INSERT 후 terminal 은 동일 행 UPDATE
 * - bootstrap / pagination / Realtime ingest 와 text·system 동일 경로
 *
 * ## call_logs (홈 「통화」 탭)
 * - **Projection 전용** — 방 타임라인에 merge 하지 않음
 * - `community_messenger_call_logs` 는 홈 탭·통화 기록 UI용 derived store
 * - lastMessage·방 preview 는 messages.call_stub 기준
 *
 * ## lastActivityAt (목록 정렬)
 * - DB 컬럼 `rooms.last_message_at` 이 lastActivityAt 권위
 * - = max(마지막 노출 메시지 createdAt, 마지막 노출 통화 eventAt)
 * - dialing INSERT 시 bump; terminal UPDATE 는 preview 갱신 + 시각은 forward-only
 * - 동일 callId 상태 변화로 lastActivityAt rollback 금지
 *
 * ## In-flight (ringing / dialing)
 * - 목록·타임라인 노출을 위해 **direct 방 dialing stub persist** (카톡식 즉시 최신 정렬)
 * - terminal 도달 시 동일 sessionId 행을 UPDATE (중복 행 금지)
 * - 재진입 시 dialing 잔존 + terminal 이 함께 있으면 projection merge 로 session 당 1행
 */

export const CM_ROOM_TIMELINE_CALL_SSOT = "community_messenger_messages.call_stub" as const;

export const CM_HOME_CALL_LOGS_PROJECTION = "community_messenger_call_logs" as const;

/** DB persist 대상 call_stub — in-flight(dialing) + terminal */
export const CM_CALL_STUB_PERSIST_STATUSES = [
  "dialing",
  "missed",
  "cancelled",
  "rejected",
  "ended",
  "failed",
] as const;
