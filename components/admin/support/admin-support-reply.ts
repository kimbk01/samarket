import { newSupportRequestId } from "@/lib/support/support-request-id";

/**
 * 어드민 공개 답변 요청 본문 (최종 감사 2026-11-28 D1 · 전체 수정 계약 §1 S-3).
 * `seenLastMessageAt` = 어드민이 화면에서 본 문의의 마지막 글 시각(마지막으로 불러온 상세의 `last_message_at`).
 * 서버는 그 시각까지 온 고객 글 알림만 읽음으로 하고, 그 뒤 고객 글이 있으면 「답변 필요」로 남긴다.
 * `requestId` = 같은 답을 다시 보낼 때 같은 값 → 서버가 처음 결과를 돌려줌(`replayed`) — 답변·고객 푸시 2번 없음.
 */
export function buildAdminSupportPublicReplyPayload(
  body: string,
  seenLastMessageAt: string | null | undefined,
  requestId?: string | null
): { action: "reply"; body: string; seenLastMessageAt?: string; requestId?: string } {
  const seen = String(seenLastMessageAt ?? "").trim();
  const rid = String(requestId ?? "").trim();
  return {
    action: "reply",
    body,
    ...(seen ? { seenLastMessageAt: seen } : {}),
    ...(rid ? { requestId: rid } : {}),
  };
}

/** 내부 메모 요청 본문 — 공개 답변과 같은 `requestId` 규칙 */
export function buildAdminSupportInternalNotePayload(
  body: string,
  requestId?: string | null
): { action: "reply"; body: string; internalNote: true; requestId?: string } {
  const rid = String(requestId ?? "").trim();
  return { action: "reply", body, internalNote: true, ...(rid ? { requestId: rid } : {}) };
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

/** uuid v4 문자열 (계약 §1 `requestId`) — 고객 창과 같은 함수 하나 */
export const createAdminSupportRequestId = newSupportRequestId;

/** 보낸 답 하나 = (문의 · 공개/메모 · 본문) + 요청 id (계약 §1: id 는 보낸 본문에 묶는다) */
export type AdminSupportReplyIntent = {
  requestId: string;
  caseId: string;
  mode: "public" | "internal";
  body: string;
};

/**
 * 이번 전송의 요청 id — 직전에 실패한 전송과 문의·종류·본문이 같으면 같은 id(재시도), 하나라도 다르면 새 id.
 * 성공하면 호출처가 기억을 지운다(같은 글을 일부러 한 번 더 보내면 새 답변).
 */
export function resolveAdminSupportReplyIntent(
  prev: AdminSupportReplyIntent | null,
  next: Omit<AdminSupportReplyIntent, "requestId">,
  makeId: () => string = createAdminSupportRequestId
): AdminSupportReplyIntent {
  if (prev && prev.caseId === next.caseId && prev.mode === next.mode && prev.body === next.body) return prev;
  return { ...next, requestId: makeId() };
}

/** 상세에서 보여 준 글 기준 「본 마지막 글 시각」 — 보여 준 글 중 가장 늦은 시각, 글이 없으면 문의 마지막 글 시각 */
export function adminSupportShownSeenAt(
  rows: readonly { created_at?: string | null }[],
  fallback: string | null | undefined
): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const r of rows) {
    const ms = Date.parse(String(r.created_at ?? ""));
    if (Number.isFinite(ms) && ms >= bestMs) {
      bestMs = ms;
      best = String(r.created_at);
    }
  }
  return best ?? (fallback ? String(fallback) : null);
}

/**
 * 읽음 요청 본문 (계약 §3 A-1) — 상세 GET 은 읽기만 하고, 화면이 보일 때 이 요청으로 읽음 처리한다.
 * 같은 상세(같은 글 목록)에는 1번만 보내도록 `key` 를 함께 돌려준다.
 */
export function buildAdminSupportSeenPayload(
  messages: readonly { id: string; created_at?: string | null }[],
  caseLastMessageAt: string | null | undefined
): { action: "seen"; shownMessageIds: string[]; seenLastMessageAt: string | null } {
  return {
    action: "seen",
    shownMessageIds: messages.map((m) => m.id),
    seenLastMessageAt: adminSupportShownSeenAt(messages, caseLastMessageAt),
  };
}

export function adminSupportSeenKey(caseId: string, payload: { shownMessageIds: string[]; seenLastMessageAt: string | null }): string {
  return `${caseId}|${payload.seenLastMessageAt ?? ""}|${payload.shownMessageIds.join(",")}`;
}
