/**
 * F1 (설계 2026-11-18 PR-1): 글 전송 결과를 서버도 알 수 없는 실패 = `message_send_unavailable` → HTTP 503.
 *
 * 클라이언트는 5xx 를 「결과 불명(indeterminate)」으로 보고 실패 행(경고 + 재전송·삭제)을 유지한다.
 * 업무 거절(아래 코드)은 지금처럼 4xx — 클라이언트가 행을 정리한다.
 *
 * 알 수 없음 판정:
 *  ① 송신 RPC 호출 오류(rpcErr — PostgREST 전송 오류·statement_timeout)
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
