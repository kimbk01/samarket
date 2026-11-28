import type { SupabaseClient } from "@supabase/supabase-js";
import { translateBy } from "@/lib/i18n/translate-by";

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

/** 「진행 중」 문의만 담당을 푼다 — 종료·보관 문의의 담당 기록은 그대로 (최종 점검 L2 · 규칙 1곳) */
export const SUPPORT_CLOSED_STATUS_FILTER = "(RESOLVED,ARCHIVED)";

/**
 * 최종 점검 L2 (2026-11-28) — 담당 해제 규칙 단일 정의. 앱 즉시 발송(받을 수 없는 담당자 self-heal) · 발송 대기열 작업자 ·
 * 권한 회수(`releaseSupportAssignmentsOnRevoke`)가 이 함수 하나를 쓴다.
 *  - 그 담당자인 **진행 중** 문의(RESOLVED·ARCHIVED 아님)만 `assigned_admin_id = null` (CAS: 담당자 그대로일 때만)
 *  - `caseId` 를 주면 그 문의만, 없으면 그 담당자의 진행 중 문의 전부
 *  - 풀린 문의마다 사건 `assignee_released_admin_revoked` 1건 (`trigger` 가 있으면 payload 에)
 * 돌려준 값 = 풀린 문의 id. 갱신 실패 = `error`(사건 기록 실패는 기록만).
 */
export async function releaseSupportAssigneeOnActiveCases(
  sb: SupabaseClient,
  input: { assigneeId: string; caseId?: string | null; actorUserId?: string | null; trigger?: string | null }
): Promise<{ caseIds: string[]; error: string | null }> {
  const assigneeId = String(input.assigneeId ?? "").trim();
  if (!assigneeId) return { caseIds: [], error: null };
  let q = sb
    .from("support_cases")
    .update({ assigned_admin_id: null, updated_at: new Date().toISOString() })
    .eq("assigned_admin_id", assigneeId)
    .not("status", "in", SUPPORT_CLOSED_STATUS_FILTER);
  if (input.caseId) q = q.eq("id", input.caseId);
  const { data, error } = await q.select("id");
  if (error) return { caseIds: [], error: error.message };
  const caseIds = ((data ?? []) as { id?: unknown }[]).map((r) => String(r.id ?? "")).filter(Boolean);
  if (caseIds.length > 0) {
    const { error: evErr } = await sb.from("support_case_events").insert(
      caseIds.map((caseId) => ({
        case_id: caseId,
        event_type: "assignee_released_admin_revoked",
        actor_user_id: input.actorUserId ?? null,
        payload: input.trigger ? { previous_assignee: assigneeId, trigger: input.trigger } : { previous_assignee: assigneeId },
      }))
    );
    if (evErr) console.error("[support] assignee_release_event_failed", { error: evErr.message });
  }
  return { caseIds, error: null };
}

export type SupportCustomerMessageAnswer = { id: string; created_at: string; answered: boolean };

/**
 * 최종 점검 M5·L3 (2026-11-28) — 한 문의의 고객 공개 글(삭제 안 됨)마다 「답 받았나」를 같은 규칙(`supportReplySawMessage`)으로 계산.
 * 답 받음 ⇔ 그 글 뒤(같은 시각 포함) 남은 어드민 공개 답변 중 그 글을 본 답변이 있음.
 *  - `onlyBeforeLatestReply` = 최신 답변 **앞** 고객 글만 (답변 정리 — 최신 답변 뒤 글은 DB 함수가 이미 WAITING_ADMIN 으로 맞춤)
 * 돌려준 값: 최신 어드민 답변 시각(없으면 fallback·null) · 글별 판정(최신 글 먼저). 읽기 실패 = null.
 */
export async function loadSupportCustomerMessageAnswers(
  sb: SupabaseClient,
  input: {
    caseId: string;
    /** true = 최신 어드민 답변(없으면 `fallbackLatestReplyAt`) **앞** 고객 글만 — 답변 정리용 */
    onlyBeforeLatestReply?: boolean;
    /** 답변 목록에 아직 안 보이는 방금 쓴 답변 시각 등 — 최신 답변이 없을 때 기준 */
    fallbackLatestReplyAt?: string | null;
    limit?: number;
  }
): Promise<{ latestReplyAt: string | null; customers: SupportCustomerMessageAnswer[]; seenAtByReply: Map<string, number> } | null> {
  const limit = input.limit ?? 1000;
  const msgs = () =>
    sb
      .from("support_messages")
      .select("id, created_at")
      .eq("case_id", input.caseId)
      .eq("message_type", "PUBLIC")
      .is("deleted_at", null);
  const [replyRes, seenMap] = await Promise.all([
    msgs().eq("sender_type", "ADMIN").order("created_at", { ascending: false }).limit(limit),
    loadSupportAdminReplySeenAt(sb, input.caseId),
  ]);
  if (replyRes.error || !seenMap) return null;
  const replies = (replyRes.data ?? []) as unknown as SupportReplyRow[];
  const latestReplyAt = replies[0]?.created_at ?? input.fallbackLatestReplyAt ?? null;
  let custQ = msgs().in("sender_type", ["MEMBER", "OWNER"]);
  if (input.onlyBeforeLatestReply && latestReplyAt) custQ = custQ.lt("created_at", latestReplyAt);
  const custRes = await custQ.order("created_at", { ascending: false }).limit(limit);
  if (custRes.error) return null;
  const customers = ((custRes.data ?? []) as unknown as { id: string; created_at: string }[]).map((m) => ({
    id: String(m.id),
    created_at: String(m.created_at),
    answered: replies.some(
      (r) => Date.parse(r.created_at) >= Date.parse(m.created_at) && supportReplySawMessage(r, seenMap, m.created_at)
    ),
  }));
  return { latestReplyAt, customers, seenAtByReply: seenMap };
}

/**
 * 최종 점검 L9 (2026-11-28) — 어드민 「고객 글」 알림 제목 = 카탈로그 키 하나 (앱 즉시 발송 · 발송 대기열 작업자 공통).
 * 어드민 운영 언어 = 한국어(카탈로그 ko).
 */
export function buildSupportCustomerRepliedTitle(isNewCase: boolean, publicCaseNo: string): string {
  return translateBy(
    "ko",
    isNewCase ? "admin_support_notify_new_title" : "admin_support_notify_followup_title",
    { no: publicCaseNo }
  );
}

/**
 * L9 — 대기열(5분 재생 SQL 이 넣은 행 포함)의 고객 글 알림 제목을 저장값이 아닌 문의·글에서 다시 만든다.
 * 첫 글 = 그 문의에서 이 글보다 앞선 고객 공개 글이 없음(재생 SQL `is_first` 와 같은 식). 읽기 실패 = null(저장값 유지).
 */
export async function loadSupportCustomerRepliedTitle(
  sb: SupabaseClient,
  input: { caseId: string; messageId: string }
): Promise<string | null> {
  const caseId = input.caseId.trim();
  const messageId = input.messageId.trim();
  if (!caseId || !messageId) return null;
  const [c, m] = await Promise.all([
    sb.from("support_cases").select("public_case_no").eq("id", caseId).maybeSingle(),
    sb.from("support_messages").select("created_at").eq("id", messageId).maybeSingle(),
  ]);
  const no = String((c.data as { public_case_no?: unknown } | null)?.public_case_no ?? "").trim();
  const at = String((m.data as { created_at?: unknown } | null)?.created_at ?? "").trim();
  if (c.error || m.error || !no || !at) return null;
  const earlier = await sb
    .from("support_messages")
    .select("id")
    .eq("case_id", caseId)
    .eq("message_type", "PUBLIC")
    .in("sender_type", ["MEMBER", "OWNER"])
    .lt("created_at", at)
    .limit(1);
  if (earlier.error) return null;
  return buildSupportCustomerRepliedTitle((earlier.data ?? []).length === 0, no);
}
