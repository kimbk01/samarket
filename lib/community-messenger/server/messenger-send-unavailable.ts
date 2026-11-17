/**
 * F1 (설계 2026-11-18 PR-1): 글 전송 결과를 서버도 알 수 없는 실패 = `message_send_unavailable` → HTTP 503.
 *
 * 클라이언트는 5xx 를 「결과 불명(indeterminate)」으로 보고 실패 행(경고 + 재전송·삭제)을 유지한다.
 * 업무 거절(아래 코드)은 지금처럼 4xx — 클라이언트가 행을 정리한다.
 *
 * 알 수 없음 판정:
 *  ① 송신 RPC 호출의 **일시** 오류(rpcErr — 네트워크·PostgREST 연결 오류·SQLSTATE 40001/40P01/55P03/57014/08xxx/53xxx/57P01~03).
 *     그 밖의 rpcErr(권한·제약 위반 등)은 재시도해도 같으므로 400 + `message_send_rejected`(PR-1 검토 #6)
 *  ② RPC `WHEN OTHERS` 응답(`rolledBack: true`) 중 업무 코드가 아닌 것(deadlock·lock timeout·직렬화 실패의 SQLERRM)
 *  ③ 서비스의 `message_send_failed`(RPC 응답 없음·readmit 실패·응답 행 없음)
 *  ④ route 의 확정 행 재조회 실패
 */

export const MESSENGER_SEND_UNAVAILABLE_ERROR = "message_send_unavailable" as const;

/** 송신 RPC·서비스 게이트의 업무 거절 코드 — 4xx 유지 */
export const MESSENGER_SEND_BUSINESS_ERROR_CODES: ReadonlySet<string> = new Set([
  "forbidden",
  "content_required",
  "room_not_found",
  "room_deleted",
  "room_blocked",
  "room_archived",
  "room_readonly",
  "store_order_chat_closed",
  "trade_chat_mode_locked",
  "trade_flow_not_chatting",
  "trade_sender_left",
  "trade_seller_closed",
  "reply_target_not_found",
  "reply_target_invalid",
  "unique_violation",
  "bad_args",
  "null_sender_forbidden",
  "domain_mismatch",
  "identity_mismatch",
  "not_member",
  "participant_left",
]);

/**
 * 송신 RPC 의 `ok:false` 응답(payload) → 서비스가 돌려줄 오류 코드.
 * `rolledBack:true` 이면서 업무 코드가 아니면(SQLERRM 문장) 알 수 없음.
 */
export function resolveMessengerSendRpcPayloadError(payload: Record<string, unknown>): string {
  const err = typeof payload.error === "string" ? payload.error.trim() : "";
  if (!err) return MESSENGER_SEND_UNAVAILABLE_ERROR;
  if (payload.rolledBack === true && !MESSENGER_SEND_BUSINESS_ERROR_CODES.has(err)) {
    return MESSENGER_SEND_UNAVAILABLE_ERROR;
  }
  if (err === "message_send_failed") return MESSENGER_SEND_UNAVAILABLE_ERROR;
  return err;
}

/** route 응답 상태 결정용 — 서버 저장 여부를 알 수 없는 실패인가 */
export function isMessengerSendUnavailableError(error: unknown): boolean {
  return error === MESSENGER_SEND_UNAVAILABLE_ERROR || error === "message_send_failed";
}

/** 일시 오류가 아닌 RPC 호출 오류(권한·제약 위반 등) — 400 */
export const MESSENGER_SEND_REJECTED_ERROR = "message_send_rejected" as const;

const TRANSIENT_SQLSTATES = new Set(["40001", "40P01", "55P03", "57014", "57P01", "57P02", "57P03"]);
/** PostgREST 자체 연결·스키마 캐시·시간 초과 오류 */
const TRANSIENT_POSTGREST_CODES = new Set(["PGRST000", "PGRST001", "PGRST002", "PGRST003"]);

/**
 * PR-1 검토 #6: 송신 RPC 호출 오류(supabase-js `error`)가 일시 오류인가.
 * - 코드 없음 = fetch 실패·네트워크(서버 응답 없음) → 일시
 * - PostgREST 연결 계열(PGRST000~003) → 일시
 * - SQLSTATE 직렬화 실패·교착·잠금 대기·문장 취소(시간 초과)·연결(08xxx)·자원 부족(53xxx)·관리자 종료(57P01~03) → 일시
 */
export function isMessengerSendTransientRpcError(err: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!err) return false;
  const code = typeof err.code === "string" ? err.code.trim().toUpperCase() : "";
  if (!code) return true;
  if (TRANSIENT_POSTGREST_CODES.has(code)) return true;
  if (TRANSIENT_SQLSTATES.has(code)) return true;
  if (/^08[0-9A-Z]{3}$/.test(code) || /^53[0-9A-Z]{3}$/.test(code)) return true;
  return false;
}

/** RPC 호출 오류 → 서비스 오류 코드 */
export function resolveMessengerSendRpcCallError(err: { code?: unknown; message?: unknown }): string {
  return isMessengerSendTransientRpcError(err) ? MESSENGER_SEND_UNAVAILABLE_ERROR : MESSENGER_SEND_REJECTED_ERROR;
}
