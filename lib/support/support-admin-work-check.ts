import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 고객 문의 — 「이 고객 글에 어드민 일이 아직 남았나?」 단일 판정 (6차 재감사 2·3 · 2026-11-27).
 * 앱 즉시 발송(notifyAdminsOfCustomerMessage)과 발송 대기열 작업자(재생·재시도)가 **같은 판정**을 쓴다.
 *
 *   send  = 문의가 OPEN·WAITING_ADMIN 이고, 이 글 **뒤에** 온 어드민 공개 답변(삭제 안 됨)이 없다
 *   skip  = 문의가 끝났거나(답변 대기 아님·종료·없음) 이 글이 이미 답을 받았다(뒤에 어드민 공개 답변 있음)
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
  const answered = await sb
    .from("support_messages")
    .select("id")
    .eq("case_id", caseId)
    .eq("sender_type", "ADMIN")
    .eq("message_type", "PUBLIC")
    .is("deleted_at", null)
    .gte("created_at", createdAt)
    .limit(1);
  if (answered.error) return "retry";
  return (answered.data ?? []).length > 0 ? "skip" : "send";
}

/** dedupe 키 `support_customer_replied:<글 id>` 에서 글 id */
export function supportMessageIdFromDedupeKey(dedupeKey: string | null | undefined): string {
  const k = String(dedupeKey ?? "");
  return k.startsWith("support_customer_replied:") ? k.slice("support_customer_replied:".length) : "";
}
