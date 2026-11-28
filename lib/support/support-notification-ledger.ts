import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markAdminNotificationsRead,
  resolveAdminNotificationsForWork,
} from "@/lib/admin/notifications/admin-notification-service";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import {
  createAndDispatchNotificationEvent,
  dispatchNotificationEvent,
} from "@/lib/notifications/pipeline/notification-event-dispatcher";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notificationCopyMeta, type NotificationCopyMetaInput } from "@/lib/notifications/notification-stored-copy";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { after } from "next/server";
import { keepAliveAfterResponse } from "@/lib/push/keep-alive-after-response";
import { enqueueSupportRequesterNotification } from "@/lib/support/support-requester-outbox";
import { buildSupportCaseRoute, type SupportCaseRow } from "@/lib/support/support-case-types";
import { isSupportTicketClosedStatus } from "@/lib/support/support-ticket-form";

/**
 * 고객센터 문의 — 미읽음 숫자·support 알림 원장 (전체 수정 계약 §3·§4 · 2026-11-29).
 *
 * 쓰기 위치는 이 파일 하나다:
 *  - 고객 미읽음 숫자(`support_cases.requester_unread_count`)·고객 support_* 알림 행(`notification_events`) 읽음/생성/본문 맞춤
 *  - 어드민 미읽음 숫자(`support_cases.admin_unread_count`)·어드민 고객센터 알림 행(`admin_notifications`) 읽음/되살림
 * 규칙(계약 §4): 고객 미읽음 숫자를 바꾸는 쓰기는 **같은 요청 안에서** 그 고객의 support_* 알림 행을 INSERT 또는 UPDATE 한다 —
 * 고객 FAB·「내 문의」는 그 행의 실시간 INSERT·UPDATE 로 다시 읽는다(새 채널 없음).
 * 읽음 = 화면에 보인 것(계약 §3): GET 은 읽기만, 읽음은 `seen` 요청(`applyRequesterSeen`·`applyAdminSeen`)만.
 */

/** 기준 시각(보여 준 목록의 마지막 글 시각) **뒤에** 온 상대방 공개 글 수(삭제 글 제외). 기준 없음 = 0. 실패 = null(쓰지 않음). */
async function countRepliesAfter(
  sb: SupabaseClient,
  caseId: string,
  viewer: "requester" | "admin",
  seenAt: string
): Promise<number | null> {
  if (!seenAt) return 0;
  let q = sb
    .from("support_messages")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("message_type", "PUBLIC")
    .is("deleted_at", null)
    .gt("created_at", seenAt);
  q = viewer === "requester" ? q.eq("sender_type", "ADMIN") : q.in("sender_type", ["MEMBER", "OWNER"]);
  const { count, error } = await q;
  if (error) return null;
  return Math.max(0, Number(count ?? 0));
}

/**
 * 고객 미읽음 → 「보여 준 목록 기준 시각 뒤에 온 어드민 공개 답변 수」로 맞춘다.
 * IDEMPOTENT: 0 이거나 계산값 = 지금 값이면 UPDATE 없음. CAS(숫자 + 마지막 글 시각) — 센 뒤 새 글이 오면 쓰지 않는다(덜 세지 않음).
 */
export async function markSupportCaseReadForRequester(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    seenLastMessageAt?: string | null;
    /** 호출 측이 본인 확인으로 읽은 문의 행(필수 — 원장은 문의를 다시 읽지 않는다) */
    caseRow: SupportCaseRow;
  }
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const c = input.caseRow;
  if (c.id !== input.caseId || c.requester_user_id !== input.userId) return { ok: false, error: "forbidden" };
  const unread = Number(c.requester_unread_count ?? 0);
  if (!Number.isFinite(unread) || unread <= 0) return { ok: true, wrote: false };
  const seen = input.seenLastMessageAt?.trim() || String(c.last_message_at ?? "");
  const remaining = await countRepliesAfter(sb, input.caseId, "requester", seen);
  if (remaining == null || remaining === unread) return { ok: true, wrote: false };
  const { error } = await sb
    .from("support_cases")
    .update({ requester_unread_count: remaining, updated_at: new Date().toISOString() })
    .eq("id", input.caseId)
    .eq("requester_unread_count", unread)
    .eq("last_message_at", c.last_message_at);
  if (error) {
    console.error("[support] requester_read_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "read_failed" };
  }
  return { ok: true, wrote: true };
}

/** 어드민 미읽음 → 「보여 준 목록 기준 시각 뒤에 온 고객 공개 글 수」. 바뀔 값이 없으면 UPDATE 없음(실시간 메아리 없음). */
export async function markSupportCaseReadForAdmin(
  sb: SupabaseClient,
  caseId: string,
  seenLastMessageAt: string | null | undefined,
  caseRow: SupportCaseRow
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  if (caseRow.id !== caseId) return { ok: false, error: "forbidden" };
  const unread = Number(caseRow.admin_unread_count ?? 0);
  if (!Number.isFinite(unread) || unread <= 0) return { ok: true, wrote: false };
  const seen = seenLastMessageAt?.trim() || String(caseRow.last_message_at ?? "");
  const remaining = await countRepliesAfter(sb, caseId, "admin", seen);
  if (remaining == null || remaining === unread) return { ok: true, wrote: false };
  const { error } = await sb
    .from("support_cases")
    .update({ admin_unread_count: remaining, updated_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("admin_unread_count", unread)
    .eq("last_message_at", caseRow.last_message_at);
  if (error) {
    console.error("[support] admin_read_failed", { caseId, error: error.message });
    return { ok: false, error: "read_failed" };
  }
  return { ok: true, wrote: true };
}

/**
 * 보는 사람의 그 문의 support_* 알림 행 읽음 (고객 알림함·앱 아이콘 숫자).
 * - `shownMessageIds` 를 주면 답변 알림(`support_admin_replied:<글 id>`)은 그 글들 것만 · 종료·재오픈 알림은 모두.
 * - `includeAdmin` = 어드민 상세: 그 어드민의 고객센터 어드민 알림도 — `shownCustomerMessageIds` 를 주면 그 글들의 고객 글 알림 + 담당 지정 알림만.
 */
export async function markSupportCaseNotificationsRead(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    includeAdmin?: boolean;
    shownMessageIds?: readonly string[];
    shownCustomerMessageIds?: readonly string[];
  }
): Promise<number> {
  const uid = input.userId.trim();
  const caseId = input.caseId.trim();
  if (!uid || !caseId) return 0;
  const now = new Date().toISOString();
  const base = () =>
    sb
      .from("notification_events")
      .update({ unread: false, read_at: now, opened_at: now })
      .eq("user_id", uid)
      .eq("unread", true)
      .is("read_at", null)
      .eq("display_payload->>supportCaseId", caseId);
  let data: { id: string }[] | null = null;
  let error: { message: string } | null = null;
  if (input.shownMessageIds) {
    const replyKeys = input.shownMessageIds.map((id) => `support_admin_replied:${id}`);
    const chunks: string[][] = [];
    for (let i = 0; i < replyKeys.length; i += 100) chunks.push(replyKeys.slice(i, i + 100));
    const results = await Promise.all([
      base().like("type", "support_%").neq("type", "support_admin_replied").select("id"),
      ...chunks.map((keys) => base().eq("type", "support_admin_replied").in("dedupe_key", keys).select("id")),
    ]);
    error = results.find((r) => r.error)?.error ?? null;
    data = results.flatMap((r) => (r.data ?? []) as { id: string }[]);
  } else {
    const r = await base().like("type", "support_%").select("id");
    error = r.error;
    data = (r.data ?? []) as { id: string }[];
  }
  const count = data?.length ?? 0;
  if (count > 0) invalidateNotificationBadgeCache(uid);
  if (error) {
    console.warn("[support] notification_read_sync_failed", { caseId, error: error.message });
    return count;
  }
  if (!input.includeAdmin) return count;
  const workRef = { table: "support_cases", id: caseId };
  const adminRead = input.shownCustomerMessageIds
    ? await (async () => {
        const [replies, assigned] = await Promise.all([
          markAdminNotificationsRead(sb, {
            adminUserId: uid,
            workRef,
            dedupeKeys: input.shownCustomerMessageIds!.map((id) => `support_customer_replied:${id}`),
          }),
          markAdminNotificationsRead(sb, { adminUserId: uid, workRef, kinds: ["support_case_assigned"] }),
        ]);
        const updated = (replies.ok ? replies.updated : 0) + (assigned.ok ? assigned.updated : 0);
        if (!replies.ok && replies.error !== "nothing_to_mark") {
          console.warn("[support] admin_notification_read_sync_failed", { caseId, part: "replies", error: replies.error });
        }
        if (!assigned.ok && assigned.error !== "nothing_to_mark") {
          console.warn("[support] admin_notification_read_sync_failed", { caseId, part: "assigned", error: assigned.error });
        }
        return replies.ok || assigned.ok
          ? ({ ok: true as const, updated })
          : ({ ok: false as const, error: (!replies.ok && replies.error) || "admin_read_failed" });
      })()
    : await markAdminNotificationsRead(sb, { adminUserId: uid, workRef });
  if (!adminRead.ok && adminRead.error !== "nothing_to_mark") {
    console.warn("[support] admin_notification_read_sync_failed", { caseId, error: adminRead.error });
  }
  return count + (adminRead.ok ? adminRead.updated : 0);
}

/**
 * 상세 GET 이 「seen 을 보낼 필요가 있는지」 알려 준다(요청 예산 — 읽을 것이 없으면 seen 요청을 보내지 않음).
 * 안 읽은 답변 숫자가 있으면 바로 true. 숫자가 0 이어도 그 문의의 안 읽은 support_* 알림(종료·재오픈 안내 등)이 있으면 true.
 * 못 읽으면 true(보내는 쪽으로 — 읽음 누락 방지).
 */
export async function requesterSupportCaseNeedsSeen(
  sb: SupabaseClient,
  input: { userId: string; caseId: string; unreadCount: number }
): Promise<boolean> {
  if (input.unreadCount > 0) return true;
  const { data, error } = await sb
    .from("notification_events")
    .select("id")
    .eq("user_id", input.userId)
    .eq("unread", true)
    .is("read_at", null)
    .eq("display_payload->>supportCaseId", input.caseId)
    .like("type", "support_%")
    .limit(1);
  if (error) return true;
  return (data?.length ?? 0) > 0;
}

/**
 * 계약 §4 신호 — 고객 미읽음 숫자가 바뀌었는데 같은 요청에서 바뀐 알림 행이 없을 때, 그 문의의 가장 최근 support_* 알림 행을
 * 같은 값으로 한 번 UPDATE 한다(값은 그대로 · 실시간 UPDATE 1건 = FAB·「내 문의」 다시 읽기). 행이 없으면 아무것도 안 한다.
 */
export async function signalRequesterSupportCounts(
  sb: SupabaseClient,
  input: { userId: string; caseId: string }
): Promise<boolean> {
  const uid = input.userId.trim();
  if (!uid || !input.caseId) return false;
  const { data, error } = await sb
    .from("notification_events")
    .select("id, read_at")
    .eq("user_id", uid)
    .eq("display_payload->>supportCaseId", input.caseId)
    .like("type", "support_%")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as { id?: unknown; read_at?: unknown }[])[0];
  if (error || !row?.id) return false;
  const { error: upErr } = await sb
    .from("notification_events")
    .update({ read_at: (row.read_at as string | null | undefined) ?? null })
    .eq("id", String(row.id))
    .eq("user_id", uid);
  if (upErr) {
    console.warn("[support] requester_signal_failed", { caseId: input.caseId, error: upErr.message });
    return false;
  }
  invalidateNotificationBadgeCache(uid);
  return true;
}

/** 보여 준 글 id 목록 정리 — 문자열·중복 제거·상한 1000 */
export function normalizeShownMessageIds(raw: unknown): string[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return null;
    if (!out.includes(s)) out.push(s);
    if (out.length > 1000) return null;
  }
  return out;
}

/**
 * 고객 `seen` (계약 §3) — 지금까지 상세 GET 안에서 하던 읽음 규칙 그대로:
 *  - 종료 + 안 읽은 답변(1회 노출): 보여 준 목록 기준으로 숫자 맞춤 + 보여 준 답변 알림만 읽음
 *  - 종료(안 읽은 답변 없음): 그 문의 support_* 알림 전부 읽음
 *  - 진행 중: 보여 준 목록 기준 숫자 맞춤 + 보여 준 답변 알림만 읽음 (그 뒤 온 답변은 남김)
 * 기준 시각이 없으면(아무 글도 안 보였다) 숫자는 바꾸지 않는다.
 * 숫자가 바뀌었는데 바뀐 알림 행이 없으면 신호 1건(§4).
 */
export async function applyRequesterSeen(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseRow: SupportCaseRow;
    shownMessageIds: readonly string[];
    seenLastMessageAt: string | null;
  }
): Promise<{ ok: true; notificationsRead: number; unreadChanged: boolean } | { ok: false; error: string }> {
  const c = input.caseRow;
  const closed = isSupportTicketClosedStatus(c.status);
  const unread = Number(c.requester_unread_count ?? 0);
  if (closed && !(unread > 0)) {
    const notificationsRead = await markSupportCaseNotificationsRead(sb, { userId: input.userId, caseId: c.id });
    return { ok: true, notificationsRead, unreadChanged: false };
  }
  let unreadChanged = false;
  if (input.seenLastMessageAt) {
    const read = await markSupportCaseReadForRequester(sb, {
      userId: input.userId,
      caseId: c.id,
      seenLastMessageAt: input.seenLastMessageAt,
      caseRow: c,
    });
    if (!read.ok) return read;
    unreadChanged = read.wrote;
  }
  const notificationsRead = await markSupportCaseNotificationsRead(sb, {
    userId: input.userId,
    caseId: c.id,
    shownMessageIds: input.shownMessageIds,
  });
  if (unreadChanged && notificationsRead === 0) await signalRequesterSupportCounts(sb, { userId: input.userId, caseId: c.id });
  return { ok: true, notificationsRead, unreadChanged };
}

/** 어드민 `seen` (계약 §3) — 지금까지 어드민 상세 GET 안에서 하던 읽음 규칙 그대로(그 어드민 것만 · 보여 준 고객 글까지). */
export async function applyAdminSeen(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    caseRow: SupportCaseRow;
    shownMessageIds: readonly string[];
    seenLastMessageAt: string | null;
  }
): Promise<{ ok: true; notificationsRead: number; unreadChanged: boolean } | { ok: false; error: string }> {
  const c = input.caseRow;
  let unreadChanged = false;
  if (input.seenLastMessageAt) {
    const read = await markSupportCaseReadForAdmin(sb, c.id, input.seenLastMessageAt, c);
    if (!read.ok) return read;
    unreadChanged = read.wrote;
  }
  const notificationsRead = await markSupportCaseNotificationsRead(sb, {
    userId: input.adminUserId,
    caseId: c.id,
    includeAdmin: true,
    shownCustomerMessageIds: input.shownMessageIds,
  });
  return { ok: true, notificationsRead, unreadChanged };
}

/** 어드민 일이 끝났다(답변으로 본 글·종료 등) → 그 문의 어드민 알림을 받은 어드민 **전원** 읽음. `dedupeKeys` = 그 글들만. */
export async function resolveSupportAdminAlerts(
  sb: SupabaseClient,
  input: { caseId: string; kinds?: readonly ("support_customer_replied" | "support_case_assigned")[]; dedupeKeys?: readonly string[] }
): Promise<number> {
  return resolveAdminNotificationsForWork(sb, {
    workRef: { table: "support_cases", id: input.caseId },
    kinds: input.kinds ?? ["support_customer_replied", "support_case_assigned"],
    ...(input.dedupeKeys ? { dedupeKeys: input.dedupeKeys } : {}),
  });
}

/** 답변 삭제로 다시 「답변 필요」가 된 고객 글의 어드민 알림이 읽혔으면 받은 어드민 전원 「안 읽음」으로 되살린다(100개씩). */
export async function reviveCustomerMessageAdminAlerts(
  sb: SupabaseClient,
  caseId: string,
  messageIds: readonly string[]
): Promise<void> {
  const keys = messageIds.map((id) => `support_customer_replied:${id}`);
  for (let i = 0; i < keys.length; i += 100) {
    const { error } = await sb
      .from("admin_notifications")
      .update({ read_at: null })
      .eq("work_ref_table", "support_cases")
      .eq("work_ref_id", caseId)
      .eq("kind", "support_customer_replied")
      .in("dedupe_key", keys.slice(i, i + 100))
      .not("read_at", "is", null);
    if (error) console.error("[support] reply_delete_alert_reopen_failed", { caseId, error: error.message });
  }
}

/**
 * B-3 — 이미 어드민 알림 행(또는 발송 대기열 키)이 있는 고객 글 id. 답변 정리·답변 삭제가 남은 글 알림을 다시 퍼뜨리지 않게 한다.
 * 읽기 실패 = null(호출 측이 판단 — 퍼뜨리는 쪽으로).
 */
export async function loadCustomerMessageIdsWithAdminAlert(
  sb: SupabaseClient,
  caseId: string,
  messageIds: readonly string[]
): Promise<Set<string> | null> {
  const out = new Set<string>();
  for (let i = 0; i < messageIds.length; i += 100) {
    const keys = messageIds.slice(i, i + 100).map((id) => `support_customer_replied:${id}`);
    const [alerts, outbox] = await Promise.all([
      sb.from("admin_notifications").select("dedupe_key").in("dedupe_key", keys).limit(1000),
      sb.from("admin_notification_outbox").select("source_key, status").in("source_key", keys).limit(1000),
    ]);
    if (alerts.error || outbox.error) return null;
    for (const r of (alerts.data ?? []) as { dedupe_key?: unknown }[]) out.add(String(r.dedupe_key ?? "").slice("support_customer_replied:".length));
    // 처리됨(delivered) 표지는 「어드민 일 끝남」 표시라 알림이 아니다 — 대기(pending) 행만 「곧 나감」으로 센다
    for (const r of (outbox.data ?? []) as { source_key?: unknown; status?: unknown }[]) {
      if (String(r.status ?? "") !== "delivered") out.add(String(r.source_key ?? "").slice("support_customer_replied:".length));
    }
  }
  return out;
}

/** 결정 2 — 수동 해제·재배정: 옛 담당자의 그 문의 미읽음 고객센터 알림(고객 글·지정) 읽음. */
export async function markFormerAssigneeCaseAlertsRead(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string }
): Promise<number> {
  const r = await markAdminNotificationsRead(sb, {
    adminUserId: input.adminUserId,
    workRef: { table: "support_cases", id: input.caseId },
    kinds: ["support_customer_replied", "support_case_assigned"],
  });
  if (!r.ok && r.error !== "nothing_to_mark") {
    console.warn("[support] former_assignee_alert_read_failed", { caseId: input.caseId, error: r.error });
  }
  return r.ok ? r.updated : 0;
}

/**
 * 답변 알림 본문 맞춤 (고객 알림함 미리보기) — B-4: 받는 사람(user_id) + 키로 찾는다(유일 키 (user_id, dedupe_key) 를 탄다).
 */
export async function syncReplyNotificationBody(
  sb: SupabaseClient,
  input: { requesterUserId: string; messageId: string; body: string }
): Promise<void> {
  const { error } = await sb
    .from("notification_events")
    .update({ body: input.body.slice(0, 500) })
    .eq("user_id", input.requesterUserId)
    .eq("dedupe_key", `support_admin_replied:${input.messageId}`);
  if (error) console.warn("[support] reply_notification_sync_failed", { messageId: input.messageId, error: error.message });
}

/**
 * 공개 답변 삭제의 고객 쪽 정리 — 알림 본문을 키로 바꾸고, 그 답변 알림이 **안 읽힌 상태였을 때만** 고객 미읽음 −1(CAS).
 * 알림 행 UPDATE 가 곧 고객 신호(§4). `caseRow` = 호출 측이 읽은 문의(다시 읽지 않는다 · B-3).
 */
export async function applyReplyDeletedForRequester(
  sb: SupabaseClient,
  input: { caseRow: SupportCaseRow; messageId: string; isPublic: boolean; now: string }
): Promise<{ unreadLowered: boolean }> {
  const c = input.caseRow;
  const requester = String(c.requester_user_id ?? "").trim();
  await syncReplyNotificationBody(sb, { requesterUserId: requester, messageId: input.messageId, body: "support_message_deleted" });
  const patch: Record<string, unknown> = { updated_at: input.now };
  let casUnread: number | null = null;
  if (input.isPublic && requester) {
    const { data: clearedRows } = await sb
      .from("notification_events")
      .update({ unread: false, read_at: input.now })
      .eq("user_id", requester)
      .eq("dedupe_key", `support_admin_replied:${input.messageId}`)
      .eq("unread", true)
      .select("id");
    if (((clearedRows ?? []) as unknown[]).length > 0) {
      const unread = Number(c.requester_unread_count ?? 0);
      if (Number.isFinite(unread) && unread > 0) {
        patch.requester_unread_count = unread - 1;
        casUnread = unread;
      }
      invalidateNotificationBadgeCache(requester);
    }
  }
  let q = sb.from("support_cases").update(patch).eq("id", c.id);
  if (casUnread != null) q = q.eq("requester_unread_count", casUnread);
  const { data: lowered } = await q.select("id");
  return { unreadLowered: casUnread != null && ((lowered ?? []) as unknown[]).length > 0 };
}

/** 고객 「확인했어요」(숫자 0 은 DB 함수가 같은 트랜잭션에서) 뒤 — 그 문의 support_* 알림 전부 읽음 · 숫자가 바뀌었는데 바뀐 행이 없으면 신호. */
export async function applyRequesterClosed(
  sb: SupabaseClient,
  input: { userId: string; caseId: string; unreadBefore: number }
): Promise<number> {
  const n = await markSupportCaseNotificationsRead(sb, { userId: input.userId, caseId: input.caseId });
  if (input.unreadBefore > 0 && n === 0) await signalRequesterSupportCounts(sb, { userId: input.userId, caseId: input.caseId });
  return n;
}

export type SupportRequesterNotificationType =
  | "support_admin_replied"
  | "support_case_resolved"
  | "support_case_reopened";

export type SupportRequesterNotificationInput = {
  userId: string;
  type: SupportRequesterNotificationType;
  title: string;
  body: string;
  caseId: string;
  publicCaseNo: string;
  audience: "MEMBER" | "OWNER";
  storeId?: string | null;
  dedupeKey: string;
  actorUserId?: string;
  copy?: NotificationCopyMetaInput;
};

function requesterNotificationEvent(input: SupportRequesterNotificationInput) {
  const routeUrl =
    input.audience === "OWNER" && input.storeId
      ? `${buildSupportCaseRoute(input.caseId)}?storeId=${encodeURIComponent(input.storeId)}`
      : buildSupportCaseRoute(input.caseId);
  return {
    userId: input.userId,
    type: input.type,
    category: input.type === "support_admin_replied" ? "inquiry_answered" : "admin_notice",
    title: input.title,
    body: input.body.slice(0, 500),
    displayPayload: {
      routeUrl,
      supportCaseId: input.caseId,
      publicCaseNo: input.publicCaseNo,
      previewKind: "support_case",
      audience: input.audience,
      ...(input.storeId ? { ownerStoreId: input.storeId } : {}),
      ...(input.copy ? { legacyMeta: notificationCopyMeta(input.copy) } : {}),
    },
    dedupeKey: input.dedupeKey,
    actorUserId: input.actorUserId,
    appState: "background" as const,
  };
}

/**
 * 고객 알림 (S-6·A-4/S-13·계약 §4):
 *  ① 알림함 행은 **응답 전에** 저장한다(같은 요청 · 실패면 1번 더) — 숫자 신호(INSERT)와 알림이 같은 요청에서 남는다.
 *     그래서 뒤이은 답변 수정·삭제가 그 행을 바로 맞출 수 있다(지운·고치기 전 원문이 알림함에 남지 않음).
 *  ② 푸시는 응답 뒤(`after`) — 보내기 직전 행을 다시 읽어 수정 본문으로 보내고, 그 답변이 지워졌거나 이미 읽혔으면 보내지 않는다.
 *  ③ 응답 전 저장이 두 번 다 실패하면 응답 뒤 한 번 더 저장+발송한다(그래도 실패 = 기록).
 */
export async function recordRequesterSupportNotification(
  sb: SupabaseClient,
  build: (lang: Awaited<ReturnType<typeof loadNotificationUserLanguage>>) => SupportRequesterNotificationInput,
  opts: { requesterUserId: string; replyMessageId?: string | null }
): Promise<{ ok: boolean }> {
  let lang: Awaited<ReturnType<typeof loadNotificationUserLanguage>>;
  try {
    lang = await loadNotificationUserLanguage(sb, opts.requesterUserId);
  } catch {
    lang = "en" as Awaited<ReturnType<typeof loadNotificationUserLanguage>>;
  }
  const event = requesterNotificationEvent(build(lang));
  const save = () => createAndDispatchNotificationEvent(sb, event as never, { deferPush: true }).catch((e: unknown) => ({
    ok: false as const,
    error: (e as Error)?.message ?? "notification_failed",
  }));
  let saved = await save();
  if (!saved.ok && !(saved as { duplicate?: boolean }).duplicate) saved = await save();
  if (saved.ok) {
    const row = saved.row;
    runAfterResponse(() =>
      pushRequesterNotification(sb, row, opts).catch((err: unknown) => {
        console.error("[support] notification_push_failed", { caseId: event.displayPayload.supportCaseId, err });
      })
    );
    return { ok: true };
  }
  if ((saved as { duplicate?: boolean }).duplicate) return { ok: true };
  const saveError = String((saved as { error?: string }).error ?? "notification_failed");
  console.error("[support] notification_failed", {
    caseId: event.displayPayload.supportCaseId,
    type: event.type,
    error: saveError,
  });
  // S-6: 영구 재시도 — 어드민 알림과 같은 대기열에 고객 알림 사건을 넣는다(5분 작업자가 다시 만듦 · 같은 dedupe 키라 중복 없음)
  await enqueueSupportRequesterNotification(
    sb,
    {
      event: event as unknown as Record<string, unknown> & { dedupeKey: string },
      requesterUserId: opts.requesterUserId,
      replyMessageId: opts.replyMessageId ?? null,
    },
    saveError
  );
  // 빠른 길: 응답 뒤 한 번 더(성공하면 작업자는 같은 키를 중복으로 보고 닫는다)
  keepAliveAfterResponse(
    createAndDispatchNotificationEvent(sb, event as never)
      .then((r) => {
        if (!r.ok && !(r as { duplicate?: boolean }).duplicate) {
          console.error("[support] notification_failed_final", { caseId: event.displayPayload.supportCaseId, type: event.type });
        }
      })
      .catch((err: unknown) => console.error("[support] notification_failed_final", { caseId: event.displayPayload.supportCaseId, err }))
  );
  return { ok: false };
}

/**
 * 응답을 보낸 **뒤에** 시작하는 작업(Next `after(fn)`) — 푸시는 그때 알림 행을 다시 읽으므로, 응답 직후의 답변 수정·삭제가 반영된다.
 * 요청 밖(크론·시험)에서는 지금 작업이 끝난 다음 차례에 시작한다.
 */
function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    setTimeout(() => {
      void task();
    }, 0);
  }
}

async function pushRequesterNotification(
  sb: SupabaseClient,
  row: NotificationEventRow,
  opts: { requesterUserId: string; replyMessageId?: string | null }
): Promise<void> {
  let latest: NotificationEventRow = row;
  if (row?.id) {
    const { data } = await sb
      .from("notification_events")
      .select("*")
      .eq("id", row.id)
      .eq("user_id", opts.requesterUserId)
      .maybeSingle();
    if (data) latest = data as NotificationEventRow;
  }
  if ((latest as { unread?: unknown }).unread === false) return; // 지운 답변(읽음 처리됨) · 이미 본 알림
  if (opts.replyMessageId) {
    const { data: m } = await sb.from("support_messages").select("deleted_at").eq("id", opts.replyMessageId).maybeSingle();
    if ((m as { deleted_at?: unknown } | null)?.deleted_at) return;
  }
  await dispatchNotificationEvent(sb, latest, { appState: "background" });
}
