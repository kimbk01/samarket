/**
 * 통화·채팅방 타임라인 제품 정책 (A안 — 카톡/텔레그램식 단순화).
 *
 * ## 방 타임라인 SSOT
 * - **SSOT**: `community_messenger_messages` rows where `message_type = 'call_stub'`
 * - bootstrap / pagination / Realtime ingest 와 text·system 동일 경로
 *
 * ## call_logs (홈 「통화목록」)
 * - **Projection 전용** — 방 타임라인에 merge 하지 않음
 * - `community_messenger_call_logs` 는 홈 탭·통화 기록 UI용 derived store
 * - lastMessage·방 preview 는 messages.call_stub 기준
 *
 * ## Reconciliation
 * - terminal call 종료 시 동일 sessionId `call_stub` UPDATE (created_at·last_message_at 불변)
 * - call_logs INSERT 는 별도 — 불일치 시 서버 repair(향후 cron) 대상
 * - 클라 UI merge 로 call_logs 를 방 타임라인에 합치지 않음
 *
 * ## In-flight (ringing / incoming_received)
 * - **히스토리 아님** — DB persist 기본 off (`call-chat-local-append.ts`)
 * - 현재 통화 UI(오버레이·active session)로만 표시
 * - 재진입 시 in-flight stub 미표시 = **정상**
 * - **Terminal event만** DB·재진입 bootstrap·Realtime SSOT
 */

export const CM_ROOM_TIMELINE_CALL_SSOT = "community_messenger_messages.call_stub" as const;

export const CM_HOME_CALL_LOGS_PROJECTION = "community_messenger_call_logs" as const;

/** DB persist 대상 call_stub — terminal 상태만 */
export const CM_CALL_STUB_PERSIST_STATUSES = [
  "missed",
  "cancelled",
  "rejected",
  "ended",
  "failed",
] as const;
