import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 고객 문의 — 「이 고객 글에 어드민 일이 아직 남았나?」 단일 판정 (6차 재감사 2·3 · 2026-11-27).
 * 앱 즉시 발송(notifyAdminsOfCustomerMessage)과 발송 대기열 작업자(재생·재시도)가 **같은 판정**을 쓴다.
 *
 *   send  = 문의가 OPEN·WAITING_ADMIN 이고, 이 글 **뒤에** 온 어드민 공개 답변(삭제 안 됨)이 없다
 *           — 또는 뒤의 답변이 모두 이 글을 「안 봤다」(답변별 본 시각 `admin_reply_seen` · `supportReplySawMessage` · 최종 감사 D1)
 *   skip  = 문의가 끝났거나(답변 대기 아님·종료·없음) 이 글이 이미 답을 받았다
 *   retry = 읽기 실패 — 보내지 않고 다음 회차에 다시(놓치지 않음)
 *
 * 「이미 답을 받은 글」 기준 덕분에, 옛 글이 같은 문의의 새 고객 글로 다시 WAITING_ADMIN 이 된 뒤에도 재알림되지 않는다.
 */
export async function supportCustomerMessageNeedsAdmin(
  sb: SupabaseClient,
  input: { caseId: string; messageId: string }
): Promise<"send" | "skip" | "retry"> {
  const caseId = input.caseId.trim();
  const messageId = input.messageId.trim();
  if (!caseId) return "send";
  const c = await sb.from("support_cases").select("status").eq("id", caseId).maybeSingle();
  if (c.error) return "retry";
  const status = String((c.data as { status?: unknown } | null)?.status ?? "");
  if (status !== "OPEN" && status !== "WAITING_ADMIN") return "skip";
  if (!messageId) return "send";
  const m = await sb.from("support_messages").select("created_at").eq("id", messageId).maybeSingle();
  if (m.error) return "retry";
  const createdAt = String((m.data as { created_at?: unknown } | null)?.created_at ?? "");
  if (!createdAt) return "skip"; // 글이 없다
  // 이 글 뒤(같은 시각 포함) 어드민 공개 답변들 — 그중 하나라도 이 글을 「봤다」면 답 받음.
  const replies = await sb
    .from("support_messages")
    .select("id, created_at")
    .eq("case_id", caseId)
    .eq("sender_type", "ADMIN")
    .eq("message_type", "PUBLIC")
    .is("deleted_at", null)
    .gte("created_at", createdAt)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (replies.error) return "retry";
  const rows = (replies.data ?? []) as SupportReplyRow[];
  if (rows.length === 0) return "send";
  const seenAt = await loadSupportAdminReplySeenAt(sb, caseId);
  if (!seenAt) return "retry";
  return rows.some((r) => supportReplySawMessage(r, seenAt, createdAt)) ? "skip" : "send";
}

/** 2차 재감사 이후 규칙의 시작 — 이보다 앞선 답변(본 시각 기록이 생기기 전)은 그때까지 글을 모두 본 것으로 본다 */
export const SUPPORT_REPLY_SEEN_RECORD_SINCE = "2026-11-28T00:00:00.000Z";

export type SupportReplyRow = { id: string; created_at: string };

/**
 * 답변 R 이 고객 글(시각 messageAt)을 봤나 — 최종 감사 D1 · 3차 재감사 (단일 규칙).
 *  - R 의 「본 시각」 기록(`admin_reply_seen`, 답변 직후 맨 먼저 남김)이 있으면: 본 시각 ≥ 글 시각
 *  - 기록이 없으면: 규칙 시작 전 답변 = 봤음(옛 답변) · 그 뒤 답변 = **안 봤음**
 *    (기록이 아직 안 들어온 순간에 판정이 돌아도 알림을 잃지 않는 쪽 — 거짓 「답 받음」 없음)
 */
export function supportReplySawMessage(
  reply: SupportReplyRow,
  seenAtByReply: Map<string, number>,
  messageAt: string
): boolean {
  const m = Date.parse(messageAt);
  const seen = seenAtByReply.get(String(reply.id));
  if (seen != null) return seen >= m;
  return Date.parse(reply.created_at) < Date.parse(SUPPORT_REPLY_SEEN_RECORD_SINCE);
}

/** 답변 id → 그 어드민이 답할 때 본 마지막 글 시각(ms). 읽기 실패 = null (판정 측 retry). */
export async function loadSupportAdminReplySeenAt(
  sb: SupabaseClient,
  caseId: string
): Promise<Map<string, number> | null> {
  const ev = await sb
    .from("support_case_events")
    .select("payload")
    .eq("case_id", caseId)
    .eq("event_type", "admin_reply_seen")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (ev.error) return null;
  const out = new Map<string, number>();
  for (const row of (ev.data ?? []) as { payload?: { reply_message_id?: unknown; seen_at?: unknown } | null }[]) {
    const rid = String(row.payload?.reply_message_id ?? "").trim();
    const t = Date.parse(String(row.payload?.seen_at ?? ""));
    if (rid && Number.isFinite(t)) out.set(rid, t);
  }
  return out;
}

/** dedupe 키 `support_customer_replied:<글 id>` 에서 글 id */
export function supportMessageIdFromDedupeKey(dedupeKey: string | null | undefined): string {
  const k = String(dedupeKey ?? "");
  return k.startsWith("support_customer_replied:") ? k.slice("support_customer_replied:".length) : "";
}
