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
/** 재감사 7: 한 번에 다시 알리는 글 수 · 동시 발송 수 · id 목록 나누기 */
export const RENOTIFY_MAX_MESSAGES = 200;
const RENOTIFY_CONCURRENCY = 5;
const ID_CHUNK = 100;

/**
 * 결정 2 (2026-11-29 · A-8·S-11): 수동 재배정이면 `assigneeAdminId` = 새 담당자 — 그 사람에게(받을 수 없으면 앱 즉시 발송과 같이
 * 담당 해제 + 전원). 없거나 null = 담당 해제·권한 회수 → support 어드민 전원.
 */
export async function renotifyReleasedSupportCases(
  sb: SupabaseClient,
  caseIds: readonly string[],
  opts: { assigneeAdminId?: string | null } = {}
): Promise<number> {
  const assigneeAdminId = opts.assigneeAdminId?.trim() || null;
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
  // 재감사 7: 한 번에 다시 알리는 글 수 상한 + 동시 5개 — 문의·글이 많아도 응답 뒤 작업이 시간 제한에 끊기지 않게
  type Job = { c: SupportCaseRow; id: string; body: string; actor: string; isFirst: boolean };
  const jobs: Job[] = [];
  let capped = false;
  for (const c of (cases ?? []) as SupportCaseRow[]) {
    if (jobs.length >= RENOTIFY_MAX_MESSAGES) {
      capped = true;
      break;
    }
    const answers = await loadSupportCustomerMessageAnswers(sb, { caseId: c.id });
    if (!answers) {
      console.error("[support] released_renotify_message_failed", { caseId: c.id });
      continue;
    }
    const pending = answers.customers.filter((m) => !m.answered).map((m) => m.id);
    // 제목 「새 고객 문의」 = 그 문의의 첫 고객 글(목록은 최신 먼저 — 마지막이 가장 오래된 글 · L9 와 같은 뜻)
    const firstId = answers.customers[answers.customers.length - 1]?.id ?? "";
    if (pending.length === 0) continue;
    const rows: { id: string; body?: string; sender_user_id?: string | null; created_at?: string }[] = [];
    let readFailed = false;
    for (let i = 0; i < pending.length; i += ID_CHUNK) {
      const { data: bodies, error: bErr } = await sb
        .from("support_messages")
        .select("id, body, sender_user_id, created_at")
        .eq("case_id", c.id)
        .in("id", pending.slice(i, i + ID_CHUNK));
      if (bErr) {
        console.error("[support] released_renotify_message_failed", { caseId: c.id, error: bErr.message });
        readFailed = true;
        break;
      }
      rows.push(...((bodies ?? []) as typeof rows));
    }
    if (readFailed) continue;
    // 오래된 글부터(알림함 순서 = 고객이 쓴 순서)
    rows.sort((x, y) => String(x.created_at ?? "").localeCompare(String(y.created_at ?? "")));
    for (const m of rows) {
      if (jobs.length >= RENOTIFY_MAX_MESSAGES) {
        capped = true;
        break;
      }
      jobs.push({ c, id: m.id, body: String(m.body ?? ""), actor: String(m.sender_user_id ?? ""), isFirst: m.id === firstId });
    }
  }
  if (capped) console.error("[support] released_renotify_capped", { max: RENOTIFY_MAX_MESSAGES, cases: ids.length });
  let sent = 0;
  for (let i = 0; i < jobs.length; i += RENOTIFY_CONCURRENCY) {
    await Promise.all(
      jobs.slice(i, i + RENOTIFY_CONCURRENCY).map(async (j) => {
        try {
          await notifyAdminsOfCustomerMessage(sb, {
            // 담당이 풀린 뒤 = 전원 발송 경로 · 재배정 = 새 담당자 경로
            caseRow: { ...j.c, assigned_admin_id: assigneeAdminId },
            messageId: j.id,
            body: j.body,
            actorUserId: j.actor,
            isNewCase: j.isFirst,
          });
          sent += 1;
        } catch (e) {
          console.error("[support] released_renotify_failed", { caseId: j.c.id, error: (e as Error).message });
        }
      })
    );
  }
  return sent;
}
