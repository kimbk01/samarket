/**
 * 어드민 공개 답변 요청 본문 (최종 감사 2026-11-28 D1).
 * `seenLastMessageAt` = 어드민이 화면에서 본 문의의 마지막 글 시각(마지막으로 불러온 상세의 `last_message_at`).
 * 서버는 그 시각까지 온 고객 글 알림만 읽음으로 하고, 그 뒤 고객 글이 있으면 「답변 필요」로 남긴다.
 */
export function buildAdminSupportPublicReplyPayload(
  body: string,
  seenLastMessageAt: string | null | undefined
): { action: "reply"; body: string; seenLastMessageAt?: string } {
  const seen = String(seenLastMessageAt ?? "").trim();
  return seen ? { action: "reply", body, seenLastMessageAt: seen } : { action: "reply", body };
}

/**
 * 「상담 종료」 요청 본문 (점검 M6 · 2026-11-28).
 * `seenLastMessageAt` = 종료를 누를 때 화면에 보이던 문의의 마지막 글 시각 —
 * 그 뒤 고객 글이 왔으면 서버가 `case_updated` 로 막고, 화면은 상세를 다시 읽는다.
 */
export function buildAdminSupportResolvePayload(
  seenLastMessageAt: string | null | undefined
): { action: "status"; status: "RESOLVED"; seenLastMessageAt?: string } {
  const seen = String(seenLastMessageAt ?? "").trim();
  return seen ? { action: "status", status: "RESOLVED", seenLastMessageAt: seen } : { action: "status", status: "RESOLVED" };
}
