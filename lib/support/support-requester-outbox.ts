import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import type { SupportCaseRow } from "@/lib/support/support-case-types";
import {
  buildReopenedNotification,
  buildResolvedNotification,
  requesterNotificationEvent,
} from "@/lib/support/support-requester-notification-copy";

/**
 * 고객 알림 영구 재시도 (전체 수정 계약 §4 · 재감사 S-6).
 * 응답 전 저장이 두 번 다 실패하면 어드민 알림과 같은 재시도 대기열(`admin_notification_outbox`)에 **고객 알림 사건**을 넣는다.
 * 5분 작업자(`processAdminNotificationOutbox`)가 꺼내 다시 만든다 — 같은 dedupe 키라 중복 없음, 실패하면 대기열 규칙대로 다시(최대 8회).
 */
export const SUPPORT_REQUESTER_OUTBOX_KIND = "support_requester_notification";

export type SupportRequesterOutboxPayload = {
  kind: typeof SUPPORT_REQUESTER_OUTBOX_KIND;
  /** `createAndDispatchNotificationEvent` 에 그대로 넘기는 사건(저장할 때와 같은 값) */
  event: Record<string, unknown> & { dedupeKey: string };
  requesterUserId: string;
  /** 답변 알림이면 그 답변 id — 보내기 직전 지워졌으면 만들지 않는다 */
  replyMessageId: string | null;
};

/**
 * 재감사 4차 — DB 함수(`support_transition_case`)가 종료·재오픈과 **같은 트랜잭션**에서 넣는 안전망 행.
 * 문구는 없고(언어는 보낼 때 정한다) 종류·문의·키만 있다 — 작업자가 문의를 다시 읽어 앱과 같은 문구로 만든다.
 */
export type SupportRequesterDeferredOutboxPayload = {
  kind: typeof SUPPORT_REQUESTER_OUTBOX_KIND;
  deferred: true;
  type: "support_case_resolved" | "support_case_reopened";
  caseId: string;
  /** 재오픈 사건 id(재오픈 안전망만) */
  eventId?: string | null;
  requesterUserId: string;
  actorUserId: string | null;
  dedupeKey: string;
};

export function isSupportRequesterDeferredOutboxPayload(payload: unknown): payload is SupportRequesterDeferredOutboxPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    p.kind === SUPPORT_REQUESTER_OUTBOX_KIND &&
    p.deferred === true &&
    (p.type === "support_case_resolved" || p.type === "support_case_reopened") &&
    typeof p.caseId === "string" &&
    typeof p.requesterUserId === "string" &&
    typeof p.dedupeKey === "string"
  );
}

export function isSupportRequesterOutboxPayload(
  payload: unknown
): payload is SupportRequesterOutboxPayload | SupportRequesterDeferredOutboxPayload {
  if (isSupportRequesterDeferredOutboxPayload(payload)) return true;
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const ev = p.event as Record<string, unknown> | undefined;
  return (
    p.kind === SUPPORT_REQUESTER_OUTBOX_KIND &&
    typeof p.requesterUserId === "string" &&
    !!ev &&
    typeof ev === "object" &&
    typeof ev.dedupeKey === "string"
  );
}

/** 대기열에 넣기 — 넣었으면(또는 이미 있으면) true */
export async function enqueueSupportRequesterNotification(
  sb: SupabaseClient,
  payload: Omit<SupportRequesterOutboxPayload, "kind">,
  error: string
): Promise<boolean> {
  const body: SupportRequesterOutboxPayload = { kind: SUPPORT_REQUESTER_OUTBOX_KIND, ...payload };
  const { error: qErr } = await sb.rpc("admin_notification_outbox_enqueue", {
    p_source_key: `requester:${payload.event.dedupeKey}`,
    p_kind: SUPPORT_REQUESTER_OUTBOX_KIND,
    p_payload: body as unknown as Record<string, unknown>,
    p_error: error.slice(0, 1000),
  });
  if (qErr) {
    console.error("[support] requester_outbox_enqueue_failed", { dedupeKey: payload.event.dedupeKey, error: qErr.message });
    return false;
  }
  return true;
}

/**
 * 저장에 실패했던 고객 알림을 다시 만드는 **단일 함수** — 응답 뒤 빠른 길(원장)과 5분 대기열 작업자가 같이 쓴다(재감사 2).
 * 저장해 둔 사건 본문을 그대로 쓰지 않고 만들기 직전에 다시 읽는다:
 *  - 그 고객의 같은 키 알림이 이미 있다 → 만들지 않음(빠른 길·작업자 중 먼저 끝난 쪽 · 중복 없음)
 *  - 답변 알림: 답변이 지워졌다 → 만들지 않음 / 고쳐졌다 → 지금 본문으로
 *  - 답변 알림: 고객이 이미 봤다(그 문의 고객 미읽음 = 0) → 안 읽은 행을 만들지 않음
 * 돌려준 값 ok=true = 처리 끝(만들었거나 만들 필요 없음) · ok=false = 다시 시도.
 */
export async function recreateSupportRequesterNotification(
  sb: SupabaseClient,
  payload: Omit<SupportRequesterOutboxPayload, "kind">
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const ev = payload.event;
  const uid = payload.requesterUserId;
  const existing = await sb
    .from("notification_events")
    .select("id")
    .eq("user_id", uid)
    .eq("dedupe_key", ev.dedupeKey)
    .maybeSingle();
  if (existing.error) return { ok: false, error: "notification_read_failed" };
  if (existing.data) return { ok: true, created: false };
  let body = typeof ev.body === "string" ? ev.body : "";
  const evCaseId = String((ev.displayPayload as { supportCaseId?: unknown } | undefined)?.supportCaseId ?? "");
  if (payload.replyMessageId) {
    const { data: m, error } = await sb
      .from("support_messages")
      .select("deleted_at, body, case_id, created_at")
      .eq("id", payload.replyMessageId)
      .maybeSingle();
    if (error) return { ok: false, error: "reply_read_failed" };
    const msg = m as { deleted_at?: unknown; body?: unknown; case_id?: unknown; created_at?: unknown } | null;
    if (!msg || msg.deleted_at) return { ok: true, created: false };
    body = String(msg.body ?? "").slice(0, 500);
    const caseId = String(msg.case_id ?? evCaseId);
    if (caseId) {
      // 재감사 2차 3: 「이 답변을 봤나」는 답변마다 — seen 과 같은 세기 규칙(고객 미읽음 = 본 기준 시각 뒤 어드민 공개 답변 수).
      //   이 답변과 그 뒤(같은 시각 포함) 남은 어드민 공개 답변 수 ≤ 고객 미읽음 이면 아직 안 봄, 크면 이미 본 답변.
      const [c, after] = await Promise.all([
        sb.from("support_cases").select("requester_unread_count").eq("id", caseId).maybeSingle(),
        sb
          .from("support_messages")
          .select("id", { count: "exact", head: true })
          .eq("case_id", caseId)
          .eq("sender_type", "ADMIN")
          .eq("message_type", "PUBLIC")
          .is("deleted_at", null)
          .gte("created_at", String(msg.created_at ?? "")),
      ]);
      if (c.error || after.error) return { ok: false, error: "case_read_failed" };
      if (!c.data) return { ok: true, created: false };
      const unread = Math.max(0, Number((c.data as { requester_unread_count?: unknown }).requester_unread_count ?? 0));
      const fromThis = Math.max(1, Number(after.count ?? 0));
      if (fromThis > unread) return { ok: true, created: false };
    }
  } else if ((ev.type === "support_case_resolved" || ev.type === "support_case_reopened") && evCaseId) {
    // 재감사 2차 3: 종료·재오픈 알림은 지금 상태가 그대로일 때만(그사이 재오픈·종료됐으면 옛 알림을 만들지 않음)
    const { data: c, error: cErr } = await sb.from("support_cases").select("status").eq("id", evCaseId).maybeSingle();
    if (cErr) return { ok: false, error: "case_read_failed" };
    const status = String((c as { status?: unknown } | null)?.status ?? "");
    const closed = status === "RESOLVED" || status === "ARCHIVED";
    const active = status === "OPEN" || status === "WAITING_ADMIN" || status === "WAITING_USER";
    if (ev.type === "support_case_resolved" ? !closed : !active) return { ok: true, created: false };
  }
  const r = await createAndDispatchNotificationEvent(sb, { ...ev, body } as never).catch((e: unknown) => ({
    ok: false as const,
    error: (e as Error)?.message ?? "notification_failed",
  }));
  if (r.ok) return { ok: true, created: true };
  if ((r as { duplicate?: boolean }).duplicate) return { ok: true, created: false };
  return { ok: false, error: String((r as { error?: string }).error ?? "notification_failed") };
}

/** 작업자가 꺼낸 고객 알림 1건 다시 만들기 — `recreateSupportRequesterNotification` 하나로 */
export async function replaySupportRequesterNotification(
  sb: SupabaseClient,
  payload: SupportRequesterOutboxPayload | SupportRequesterDeferredOutboxPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isSupportRequesterDeferredOutboxPayload(payload)) {
    // 이미 있으면(앱이 먼저 만듦) 문의·언어도 읽지 않고 끝
    const existing = await sb
      .from("notification_events")
      .select("id")
      .eq("user_id", payload.requesterUserId)
      .eq("dedupe_key", payload.dedupeKey)
      .maybeSingle();
    if (existing.error) return { ok: false, error: "notification_read_failed" };
    if (existing.data) return { ok: true };
    const { data: row, error } = await sb.from("support_cases").select("*").eq("id", payload.caseId).maybeSingle();
    if (error) return { ok: false, error: "case_read_failed" };
    if (!row) return { ok: true };
    const c = row as SupportCaseRow;
    let lang: Awaited<ReturnType<typeof loadNotificationUserLanguage>>;
    try {
      lang = await loadNotificationUserLanguage(sb, payload.requesterUserId);
    } catch {
      lang = "en" as Awaited<ReturnType<typeof loadNotificationUserLanguage>>;
    }
    let input;
    if (payload.type === "support_case_resolved") {
      input = buildResolvedNotification(c, payload.actorUserId ?? undefined, lang);
      // 5차 재감사: 지금 문의의 종료 회차(종료 시각)가 대기열 키와 다르면 지난 회차 — 만들지 않는다(늦은 옛 「종료」 금지)
      if (input.dedupeKey !== payload.dedupeKey) return { ok: true };
    } else {
      // 6차 재감사: 재오픈 회차 = 가장 최근 재오픈 사건. 그 뒤 다시 재오픈됐으면 지난 회차 — 만들지 않는다(글이 와도 키는 그대로)
      const { data: lastReopen, error: evErr } = await sb
        .from("support_case_events")
        .select("id")
        .eq("case_id", payload.caseId)
        .eq("event_type", "reopened")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (evErr) return { ok: false, error: "event_read_failed" };
      const latestId = (lastReopen as { id?: string } | null)?.id ?? null;
      if (payload.eventId && latestId && latestId !== payload.eventId) return { ok: true };
      input = buildReopenedNotification(c, payload.actorUserId ?? undefined, lang, payload.eventId ?? null);
      input.dedupeKey = payload.dedupeKey;
    }
    const event = requesterNotificationEvent(input) as unknown as Record<string, unknown> & { dedupeKey: string };
    const r = await recreateSupportRequesterNotification(sb, {
      event,
      requesterUserId: payload.requesterUserId,
      replyMessageId: null,
    });
    return r.ok ? { ok: true } : r;
  }
  const r = await recreateSupportRequesterNotification(sb, payload);
  return r.ok ? { ok: true } : r;
}
