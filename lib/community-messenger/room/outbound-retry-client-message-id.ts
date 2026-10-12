/**
 * 텍스트 전송 재시도 시 `clientMessageId` 재사용 규칙 (D-7).
 *
 * 문제: fetch 예외(응답 유실·네트워크 끊김)·5xx 는 **서버가 이미 커밋했을 수 있는** 불확실 실패다. 예전에는 입력창만 복원하고
 * 재전송 때 새 clientMessageId 를 만들어, 첫 요청이 실제로 저장된 경우 같은 문장이 2행 저장됐다.
 * 서버(`community_messenger_send_text_message`)는 같은 (room, sender, client_message_id) 면 기존 행을 `deduped:true` 로
 * 돌려주고 푸시도 다시 보내지 않는다 → 같은 id 로 재시도하면 최대 1행.
 *
 * 의도적 반복 전송과 구분:
 * - 불확실 실패 직후, **같은 내용 + 같은 답장 대상**을 다시 보낼 때만 재사용한다(입력 복원 후 다시 누르는 흐름).
 * - 보관값은 다음 전송 시도에서 소비된다(성공·다른 내용 전송 후에는 다시 쓰이지 않음) → 성공 뒤 같은 문장을 또 보내면 새 행.
 * - 4xx 등 서버가 거절을 확정한 실패는 보관하지 않는다(저장되지 않았음이 확정).
 * - 오래된 실패(창 밖)는 재사용하지 않는다 — 한참 뒤 같은 문장을 새로 쓴 경우를 과거 행으로 합치지 않기 위함.
 */
export const OUTBOUND_RETRY_CLIENT_MESSAGE_ID_REUSE_WINDOW_MS = 120_000;

export type UncertainOutboundTextSend = {
  content: string;
  replyToMessageId: string;
  clientMessageId: string;
  failedAt: number;
};

/** HTTP 응답 기준 — 서버 커밋 여부가 불확실한 실패인가 (예외는 호출부에서 항상 불확실로 처리) */
export function isUncertainOutboundSendHttpStatus(status: number): boolean {
  return status >= 500 || status === 0;
}

export function resolveOutboundTextClientMessageId(args: {
  uncertainFailure: UncertainOutboundTextSend | null;
  content: string;
  replyToMessageId: string;
  now: number;
  createClientMessageId: () => string;
}): { clientMessageId: string; reused: boolean } {
  const prev = args.uncertainFailure;
  if (
    prev &&
    prev.clientMessageId.trim() &&
    prev.content === args.content &&
    prev.replyToMessageId === args.replyToMessageId &&
    args.now - prev.failedAt >= 0 &&
    args.now - prev.failedAt <= OUTBOUND_RETRY_CLIENT_MESSAGE_ID_REUSE_WINDOW_MS
  ) {
    return { clientMessageId: prev.clientMessageId, reused: true };
  }
  return { clientMessageId: args.createClientMessageId(), reused: false };
}
