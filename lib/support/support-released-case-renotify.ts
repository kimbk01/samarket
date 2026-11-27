import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdminsOfCustomerMessage } from "@/lib/support/support-case-service";
import type { SupportCaseRow } from "@/lib/support/support-case-types";

/**
 * 고객 문의 최종 감사 L2 (2026-11-28) — 담당자가 support 권한을 잃어 담당이 풀린 진행 중 문의는,
 * 그 담당자에게만 갔던 고객 글 알림을 **볼 어드민이 0명**이 된다(재생 함수는 같은 dedupe 키가 이미 있어 다시 보내지 않는다).
 * → 풀린 문의 중 어드민 일이 남은 것(OPEN·WAITING_ADMIN)의 **가장 늦은 고객 공개 글**을 support 어드민 전원에게 다시 알린다.
 *
 * - 같은 dedupe 키(`support_customer_replied:<글 id>`)로 보낸다. 알림 행 유일성은 「받는 사람 + 키」라
 *   옛 담당자 행이 있어도 다른 어드민 행은 새로 생긴다(옛 담당자는 권한이 없어 후보에서 빠진다 · 중복 없음).
 * - 보내기 직전 판정·글쓴이 제외는 앱 즉시 발송(`notifyAdminsOfCustomerMessage`)과 같다(이미 답 받은 글이면 보내지 않음).
 * - 실패는 기록만(권한 저장은 이미 끝남).
 */
export async function renotifyReleasedSupportCases(sb: SupabaseClient, caseIds: readonly string[]): Promise<number> {
  const ids = [...new Set(caseIds.map((s) => String(s).trim()).filter(Boolean))].slice(0, 200);
  if (ids.length === 0) return 0;
  const { data: cases, error } = await sb
    .from("support_cases")
    .select("*")
    .in("id", ids)
    .in("status", ["OPEN", "WAITING_ADMIN"]);
  if (error) {
    console.error("[support] released_renotify_cases_failed", { error: error.message });
    return 0;
  }
  let sent = 0;
  for (const c of (cases ?? []) as SupportCaseRow[]) {
    const { data: latest, error: mErr } = await sb
      .from("support_messages")
      .select("id, body, sender_user_id")
      .eq("case_id", c.id)
      .eq("message_type", "PUBLIC")
      .in("sender_type", ["MEMBER", "OWNER"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mErr) {
      console.error("[support] released_renotify_message_failed", { caseId: c.id, error: mErr.message });
      continue;
    }
    const m = latest as { id?: string; body?: string; sender_user_id?: string | null } | null;
    if (!m?.id) continue;
    try {
      await notifyAdminsOfCustomerMessage(sb, {
        // 담당이 풀린 뒤 상태 — 전원 발송 경로로 간다
        caseRow: { ...c, assigned_admin_id: null },
        messageId: m.id,
        body: String(m.body ?? ""),
        actorUserId: String(m.sender_user_id ?? ""),
        isNewCase: false,
      });
      sent += 1;
    } catch (e) {
      console.error("[support] released_renotify_failed", { caseId: c.id, error: (e as Error).message });
    }
  }
  return sent;
}
