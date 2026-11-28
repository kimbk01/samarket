import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdminsOfCustomerMessage } from "@/lib/support/support-case-service";
import type { SupportCaseRow } from "@/lib/support/support-case-types";
import { loadSupportCustomerMessageAnswers } from "@/lib/support/support-admin-work-check";

/**
 * 고객 문의 최종 감사 L2 (2026-11-28) — 담당자가 support 권한을 잃어 담당이 풀린 진행 중 문의는,
 * 그 담당자에게만 갔던 고객 글 알림을 **볼 어드민이 0명**이 된다(재생 함수는 같은 dedupe 키가 이미 있어 다시 보내지 않는다).
 * → 풀린 문의 중 어드민 일이 남은 것(OPEN·WAITING_ADMIN)의 **답을 못 받은 고객 공개 글 전부**를 support 어드민 전원에게 다시 알린다
 *   (최종 점검 L3 — 계약 「남은 글」. 판정 = 답변 정리와 같은 `loadSupportCustomerMessageAnswers` · `supportReplySawMessage`).
 *
 * - 같은 dedupe 키(`support_customer_replied:<글 id>`)로 보낸다. 알림 행 유일성은 「받는 사람 + 키」라
 *   옛 담당자 행이 있어도 다른 어드민 행은 새로 생긴다(옛 담당자는 권한이 없어 후보에서 빠진다 · 중복 없음).
 * - 보내기 직전 판정·글쓴이 제외는 앱 즉시 발송(`notifyAdminsOfCustomerMessage`)과 같다(이미 답 받은 글이면 보내지 않음).
 * - 실패는 기록만(권한 저장은 이미 끝남). 돌려준 값 = 다시 알린 글 수.
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
    const answers = await loadSupportCustomerMessageAnswers(sb, { caseId: c.id });
    if (!answers) {
      console.error("[support] released_renotify_message_failed", { caseId: c.id });
      continue;
    }
    const pending = answers.customers.filter((m) => !m.answered).map((m) => m.id);
    // 제목 「새 고객 문의」 = 그 문의의 첫 고객 글(목록은 최신 먼저 — 마지막이 가장 오래된 글 · L9 와 같은 뜻)
    const firstId = answers.customers[answers.customers.length - 1]?.id ?? "";
    if (pending.length === 0) continue;
    const { data: bodies, error: bErr } = await sb
      .from("support_messages")
      .select("id, body, sender_user_id, created_at")
      .eq("case_id", c.id)
      .in("id", pending);
    if (bErr) {
      console.error("[support] released_renotify_message_failed", { caseId: c.id, error: bErr.message });
      continue;
    }
    // 오래된 글부터(알림함 순서 = 고객이 쓴 순서)
    const rows = ((bodies ?? []) as { id: string; body?: string; sender_user_id?: string | null; created_at?: string }[])
      .slice()
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    for (const m of rows) {
      try {
        await notifyAdminsOfCustomerMessage(sb, {
          // 담당이 풀린 뒤 상태 — 전원 발송 경로로 간다
          caseRow: { ...c, assigned_admin_id: null },
          messageId: m.id,
          body: String(m.body ?? ""),
          actorUserId: String(m.sender_user_id ?? ""),
          isNewCase: m.id === firstId,
        });
        sent += 1;
      } catch (e) {
        console.error("[support] released_renotify_failed", { caseId: c.id, error: (e as Error).message });
      }
    }
  }
  return sent;
}
