import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 고객 문의 — 「이 고객 글에 어드민 일이 아직 남았나?」 단일 판정 (6차 재감사 2·3 · 2026-11-27).
 * 앱 즉시 발송(notifyAdminsOfCustomerMessage)과 발송 대기열 작업자(재생·재시도)가 **같은 판정**을 쓴다.
 *
 *   send  = 문의가 OPEN·WAITING_ADMIN 이고, 이 글 **뒤에** 온 어드민 공개 답변(삭제 안 됨)이 없다
 *           — 또는 뒤의 답변이 이 글을 못 보고 나갔다고 기록됐다(`reply_left_unseen_customer_messages` · 최종 감사 D1)
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
  // 이 글 뒤(같은 시각 포함) 가장 늦은 어드민 공개 답변 — 있으면 전체에서도 가장 늦은 답변이다.
  const answered = await sb
    .from("support_messages")
    .select("created_at")
    .eq("case_id", caseId)
    .eq("sender_type", "ADMIN")
    .eq("message_type", "PUBLIC")
    .is("deleted_at", null)
    .gte("created_at", createdAt)
    .order("created_at", { ascending: false })
    .limit(1);
  if (answered.error) return "retry";
  const latestReplyAt = String(
    ((answered.data ?? [])[0] as { created_at?: unknown } | undefined)?.created_at ?? ""
  );
  if (!latestReplyAt) return "send";
  // 최종 감사 D1 (2026-11-28): 이 글 뒤에 어드민 답변이 있다 = 원칙적으로 「답 받음」(skip).
  // 예외는 하나 — 그 답변이 이 글을 **보지 못하고** 나갔다고 서버가 기록한 경우
  // (`adminReplySupportCase` 의 `reply_left_unseen_customer_messages`, 그 답변 뒤 시각 · payload.message_ids).
  // 추측(「답변 뒤 고객 글이 없으면 못 본 것」)으로 판정하지 않는다 — 재오픈 등 다른 경우의 옛 글이 재알림된다.
  const unseen = await sb
    .from("support_case_events")
    .select("payload")
    .eq("case_id", caseId)
    .eq("event_type", "reply_left_unseen_customer_messages")
    .gte("created_at", latestReplyAt)
    .limit(20);
  if (unseen.error) return "retry";
  const leftUnseen = ((unseen.data ?? []) as { payload?: { message_ids?: unknown } | null }[]).some((row) => {
    const ids = row.payload?.message_ids;
    return Array.isArray(ids) && ids.map(String).includes(messageId);
  });
  return leftUnseen ? "send" : "skip";
}

/** dedupe 키 `support_customer_replied:<글 id>` 에서 글 id */
export function supportMessageIdFromDedupeKey(dedupeKey: string | null | undefined): string {
  const k = String(dedupeKey ?? "");
  return k.startsWith("support_customer_replied:") ? k.slice("support_customer_replied:".length) : "";
}
