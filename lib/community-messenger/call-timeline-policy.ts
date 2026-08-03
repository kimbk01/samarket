/**
 * 통화·채팅방 타임라인 제품 정책 (카톡·텔레그램·Viber 계열).
 *
 * ## 방 타임라인 SSOT
 * - **SSOT**: `community_messenger_messages` rows where `message_type = 'call_stub'`
 * - **callId(sessionId) 당 논리 1행** — terminal INSERT(또는 기존 행 UPDATE) 로 확정
 * - bootstrap / pagination / Realtime ingest 와 text·system 동일 경로
 *
 * ## call_logs (홈 「통화」 탭)
 * - **Projection 전용** — 방 타임라인에 merge 하지 않음
 * - `community_messenger_call_logs` 는 홈 탭·통화 기록 UI용 derived store
 * - lastMessage·방 preview 는 messages.call_stub 기준
 *
 * ## lastActivityAt (목록 정렬)
 * - DB 컬럼 `rooms.last_message_at` 이 lastActivityAt 권위
 * - = max(이전 last_message_at, terminal occurred_at[=ended_at])
 * - terminal stub INSERT/UPDATE 시 listActivityAt(ended_at) 으로 forward-only bump
 * - 타임라인 행 `created_at` 은 session.started_at 유지(동일 callId UPDATE 시 불변)
 * - 동일 callId 상태 변화로 lastActivityAt rollback 금지
 * - dialing stub 미발행(2026-07-29) 이후 terminal 이 유일한 bump 지점 — bump 생략 금지
 *
 * ## In-flight (ringing / dialing) — 2026-07-29
 * - **1:1 direct: 링 중 dialing call_stub 를 DB/Realtime 에 publish 하지 않음**
 *   (수신자 메신저가 VoIP/CallKit 벨보다 먼저 「발신 중」을 보는 race 방지)
 * - 발신 UI 진행 상태는 Native session state 권위
 * - terminal(연결 종료·거절·취소·부재중) 도달 시 sessionId 당 이력 1행만 확정
 * - 레거시 dialing 잔존 + terminal 이 함께 있으면 projection merge 로 session 당 1행
 * - VoIP dispatch 는 `dispatchIncomingCallVoipOnCriticalPath` (HTTP `after()` 금지)
 * - Native-only mid-call tip 이 terminal stub/list projection 을 차단하면 안 됨
 *
 * ## Terminal unread
 * - terminal INSERT 는 기존 atomic message append 로 non-actor participant unread 증가
 * - 같은 sessionId terminal 재처리는 기존 stub UPDATE만 수행(중복 unread 금지)
 * - room-bound missed 는 call_stub/B only; notification_events/Bell 중복 생성 금지
 */

export const CM_ROOM_TIMELINE_CALL_SSOT = "community_messenger_messages.call_stub" as const;

export const CM_HOME_CALL_LOGS_PROJECTION = "community_messenger_call_logs" as const;

/**
 * DB persist 대상 call_stub — terminal only for start path.
 * `dialing`/`incoming` 은 레거시·테스트 호환으로 append API 가 받을 수 있으나
 * 1:1 start·stub-message API 는 in-flight publish 를 거부한다.
 */
export const CM_CALL_STUB_PERSIST_STATUSES = [
  "missed",
  "cancelled",
  "rejected",
  "ended",
  "failed",
] as const;

/** @deprecated in-flight — do not publish on 1:1 start */
export const CM_CALL_STUB_IN_FLIGHT_STATUSES = ["dialing", "incoming"] as const;
