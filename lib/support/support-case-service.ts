import {
  supportAllDomainAppealOrFilter,
  supportAppealOrFilter,
  supportCommunityScopeOrFilter,
  supportTradeAppealOrFilter,
  supportTradeScopeOrFilter,
  type SupportCaseKind,
  type SupportCaseScope,
} from "@/lib/support/support-community-filter";
import {
  authorityAllows,
  settleSupportCustomerMessageNotification,
  createAdminNotification,
  markAdminNotificationsRead,
  resolveAdminNotificationsForWork,
  resolveAdminRecipientAuthority,
} from "@/lib/admin/notifications/admin-notification-service";
import { keepAliveAfterResponse } from "@/lib/push/keep-alive-after-response";
import {
  buildSupportCustomerRepliedTitle,
  loadSupportAdminReplySeenAt,
  loadSupportCustomerMessageAnswers,
  releaseSupportAssigneeOnActiveCases,
  supportCustomerMessageNeedsAdmin,
  supportReplySawMessage,
} from "@/lib/support/support-admin-work-check";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mypageKeysetOrFilter,
  sliceMypageKeysetPage,
  type MypageListCursor,
} from "@/lib/mypage/mypage-list-cursor";
import {
  SUPPORT_CASE_HISTORY_TAB_STATUSES,
  type SupportCaseHistoryTab,
} from "@/lib/support/support-status-label";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import type { SupportContext } from "@/lib/support/support-context";
import { isSupportContextEnabled } from "@/lib/support/support-context";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import {
  notificationCopyMeta,
  type NotificationCopyMetaInput,
} from "@/lib/notifications/notification-stored-copy";
import { buildSupportOpenedSeedBody, buildSupportTriageSeedBody } from "@/lib/support/support-seed-message-text";
import {
  ACTIVE_SUPPORT_CASE_STATUSES,
  buildAdminSupportCaseRoute,
  buildSupportCaseRoute,
  type SupportCaseRow,
  type SupportMessageRow,
  type SupportCaseStatus,
  type SupportCasePriority,
  type AdminSupportListFilter,
  ADMIN_SUPPORT_TABS,
  type AdminSupportTab,
} from "@/lib/support/support-case-types";
import { applySupportCaseTabFilter } from "@/lib/admin/metrics/admin-metric-filters";
import { getSupportCategoryGroup } from "@/lib/support/support-category-groups";

export type { AdminSupportListFilter } from "@/lib/support/support-case-types";
import {
  assertSupportReferenceAuthority,
  normalizeSupportContextForCase,
} from "@/lib/support/support-reference-authority";
import { validateSupportCategoryForOpen } from "@/lib/support/support-category-registry";
import { assertSupportGuidanceForCaseOpen } from "@/lib/support/support-guidance-service";
import { translateBy } from "@/lib/i18n/translate-by";
import { assertSupportGenericHubCategoryPolicy } from "@/lib/support/support-generic-hub-policy";
import type { SupportGuidanceOutcome } from "@/lib/support/support-guidance-authority";

function isMissingSupportTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("support_cases") && m.includes("does not exist");
}

/**
 * 남은 위험 ① — 기준 시각(보여 준 목록의 마지막 글 시각) **뒤에** 온 상대방 공개 글 수(삭제된 글 제외).
 * requester = 어드민 공개 답변 · admin = 고객(회원·사장님) 공개 글. 기준 시각이 없으면 전부 본 것으로(0). 실패 = null(쓰지 않음).
 */
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
 * 4차 재감사 ① — 화면에 보여 준 글 목록의 **가장 늦은 글 시각**(읽음 기준). 목록이 비면 대신 값(문의 last_message_at).
 * 문의 행을 먼저 읽고 목록을 나중에 읽으므로, 그 사이에 온 글도 목록에 있으면 「본 것」으로 센다.
 */
export function supportShownListSeenAt(
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

/** 같은 시각인지 (DB `timestamptz` 문자열 표기 차이 무시). 둘 중 하나라도 해석 못 하면 문자열 비교. */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = Date.parse(String(a ?? ""));
  const tb = Date.parse(String(b ?? ""));
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  return String(a ?? "") === String(b ?? "");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

async function allocatePublicCaseNo(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.rpc("allocate_support_public_case_no");
  if (!error && typeof data === "string" && data.trim()) {
    return data.trim();
  }
  const fallback = `${Date.now()}`.slice(-8);
  return `SC-${fallback}`;
}

function defaultSubject(category: string, sourceSurface: string): string {
  const cat = category.trim();
  const surface = sourceSurface.trim();
  if (!cat) return surface || "SUPPORT";
  return surface ? `${cat} · ${surface}` : cat;
}

/** 저장 글자는 그대로(열 없음) — 고객 화면은 `resolveSupportMessageDisplayBody` 가 키로 그린다 (설계 §4-3) */
function buildDefaultTriageSeed(category: string, issueType: string | null): string {
  return buildSupportTriageSeedBody(category, issueType);
}

/**
 * PHASE 3-A open payload.
 *
 * Existing contextual callers (FAB / hubs / shells) omit issueType →
 * centralized allowMissingIssue path (NULL issue_type).
 * New structured triage later must pass allowMissingIssue: false.
 */
export type OpenSupportCaseInput = {
  userId: string;
  context: SupportContext;
  initialBody?: string;
  issueType?: string | null;
  initialSummary?: string | null;
  guidanceKey?: string | null;
  guidanceRevision?: number | null;
  guidanceOutcome?: SupportGuidanceOutcome | string | null;
  /**
   * Default true for Production contextual callers.
   * Structured triage must set false so issue_type is required.
   */
  allowMissingIssue?: boolean;
  /** Required when generic hub opens with OTHER after user picked 기타. */
  explicitOtherSelection?: boolean;
};

async function recordCaseEvent(
  sb: SupabaseClient,
  input: {
    caseId: string;
    eventType: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await sb.from("support_case_events").insert({
    case_id: input.caseId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    payload: input.payload ?? {},
  });
  if (error) {
    // DEF-05 (Phase 1 observability only): audit-trail write failure must be visible.
    console.error("[support] case_event_insert_failed", {
      caseId: input.caseId,
      eventType: input.eventType,
      error: error.message,
    });
  }
}

/**
 * 고객 문의 SSOT §3-2 (F1·F13·F14) — 고객(회원·사장님)의 공개 글 1건 = 어드민 알림 1건.
 * - 담당자가 있으면 담당자에게, 없으면 `support` 권한 어드민 전원에게(어드민 알림함 + 푸시).
 * - dedupe 키는 글 id 하나(`support_customer_replied:<글 id>`) — DB 재생 함수
 *   `admin_notification_replay_support_replies` 가 같은 키를 보고 다시 보내지 않는다(담당 지정 뒤 지난 글 재알림 방지).
 * - 어드민 알림 문구 = 한국어(어드민 운영 언어 · 카탈로그 키).
 */
/** 시험에서 「끝난 일」 분기를 그대로 부르기 위해 내보낸다(앱 코드는 notifyAdminsAfterResponse 만 쓴다). */
export async function notifyAdminsOfCustomerMessage(
  sb: SupabaseClient,
  input: {
    caseRow: SupportCaseRow;
    messageId: string;
    body: string;
    actorUserId: string;
    isNewCase: boolean;
  }
): Promise<void> {
  const c = input.caseRow;
  // 발송은 응답 뒤라 그사이 어드민이 답했거나 문의가 끝났을 수 있다 → 작업자(재생·재시도)와 **같은 판정**
  // (`supportCustomerMessageNeedsAdmin`: 문의 OPEN·WAITING_ADMIN + 이 글 뒤 어드민 공개 답변 없음).
  let verdict = await supportCustomerMessageNeedsAdmin(sb, { caseId: c.id, messageId: input.messageId });
  if (verdict === "retry") verdict = await supportCustomerMessageNeedsAdmin(sb, { caseId: c.id, messageId: input.messageId });
  if (verdict === "retry") {
    // 끝내 못 읽으면 보내지 않는다 — 5분 재생 함수가 대기열에 넣고 작업자가 같은 판정으로 보낸다(놓치지 않음).
    console.warn("[support] admin_notify_status_read_failed", { caseId: c.id });
    return;
  }
  // 어드민 일이 이미 끝났다(답변·종료·이미 답 받은 글) → 알림은 만들지 않고, 재생 함수가 보는 발송 대기열 키만
  // 「처리됨(delivered)」으로 남긴다. (키를 못 남겨도 작업자가 보내기 직전 같은 판정으로 건너뛴다.)
  const workDone = verdict === "skip";
  // 최종 점검 L9: 제목 = 발송 대기열 작업자와 같은 카탈로그 키 함수
  const title = buildSupportCustomerRepliedTitle(input.isNewCase, c.public_case_no);
  const base = {
    kind: "support_customer_replied",
    title,
    body: input.body,
    linkUrl: buildAdminSupportCaseRoute(c.id),
    workRef: { table: "support_cases", id: c.id },
    dedupeKey: `support_customer_replied:${input.messageId}`,
    actorUserId: input.actorUserId,
    // 재감사 D10: 어드민 계정이 고객으로 문의해도 자기 알림은 없다(콘솔 토스트 「본인 행동 0」과 같은 규칙).
    excludeRecipientIds: [input.actorUserId],
    push: true,
  } as const;
  if (workDone) {
    await markCustomerMessageHandledForReplay(sb, { messageId: input.messageId, caseId: c.id, reason: "admin_work_done" });
    return;
  }
  const logFail = (error: string) =>
    console.error("[support] admin_notification_failed", {
      caseId: c.id,
      type: "support_customer_replied",
      error,
    });

  const assignee = c.assigned_admin_id ? String(c.assigned_admin_id) : "";
  // 최종 감사 L5: 담당자 = 글쓴이(어드민이 회원으로 문의하고 본인이 담당)면 제외 규칙 때문에 아무도 못 받는다 → 아래 전원 발송.
  if (assignee && assignee !== input.actorUserId) {
    // 재감사 D2: 담당자도 support 권한이 있어야 받는다 — 없거나 잃었으면 아래 self-heal 뒤 전원에게.
    const notified = await createAdminNotification(sb, {
      ...base,
      recipientAdminIds: [assignee],
      requiredPermission: "support",
    });
    if (!notified.ok) {
      logFail(notified.error);
      return;
    }
    if (notified.skippedRecipients === 0) {
      // 6차 재감사 3: 만든 사이 어드민이 답했으면 이 글 알림만 읽음
      if (notified.created > 0) await settleSupportCustomerMessageNotification(sb, { caseId: c.id, dedupeKey: base.dedupeKey });
      return;
    }
    // Self-heal: the assignee lost admin authority but the revoke-time release did not run
    // (or failed). Return the case to the unassigned queue so it is not stranded,
    // then fall through to the unassigned fan-out so this message is not lost.
    // 최종 점검 L2: 담당 해제 규칙 1곳 — 진행 중 문의만(그사이 종료된 문의의 담당 기록은 그대로)
    const released = await releaseSupportAssigneeOnActiveCases(sb, { assigneeId: assignee, caseId: c.id, trigger: "customer_reply" });
    if (released.error) console.error("[support] assignee_release_failed", { caseId: c.id, error: released.error });
  }

  const broadcast = await createAdminNotification(sb, {
    ...base,
    broadcastPermission: "support",
    requiredPermission: "support",
  });
  if (!broadcast.ok) logFail(broadcast.error);
  else if (broadcast.created > 0) await settleSupportCustomerMessageNotification(sb, { caseId: c.id, dedupeKey: base.dedupeKey });
}

/**
 * 남은 위험 ④ — 「이 고객 글은 어드민 일이 끝나 알림이 필요 없다」를 재생 함수가 보는 키로만 남긴다.
 * `admin_notification_outbox` 에 같은 키(`support_customer_replied:<글 id>`)를 **처리됨**으로 넣는다 → 작업자가 꺼내지 않고
 * (pending 만 꺼냄), 재생 함수는 키가 있어 건너뛴다. 어드민 알림함에는 아무것도 생기지 않는다. 이미 키가 있으면 그대로(23505).
 */
async function markCustomerMessageHandledForReplay(
  sb: SupabaseClient,
  input: { messageId: string; caseId: string; reason: string }
): Promise<void> {
  const now = new Date().toISOString();
  const insert = () =>
    sb.from("admin_notification_outbox").insert({
      source_key: `support_customer_replied:${input.messageId}`,
      kind: "support_customer_replied",
      payload: { handled: true, reason: "admin_work_done", caseStatus: input.reason, caseId: input.caseId },
      status: "delivered",
      delivered_at: now,
    });
  let { error } = await insert();
  if (error && (error as { code?: string }).code !== "23505") ({ error } = await insert()); // 한 번 더
  if (error && (error as { code?: string }).code !== "23505") {
    // 두 번 다 실패해도: 작업자(재생·재시도)가 보내기 직전 같은 판정(이미 답 받은 글이면 건너뜀)을 하므로 재알림되지 않는다.
    console.warn("[support] handled_marker_failed", { caseId: input.caseId, error: error.message });
  }
}

/**
 * 재감사 D3: 문의의 어드민 일이 끝났다(공개 답변·종료·보관·자동 종료) → 그 문의의 어드민 알림을
 * 받은 어드민 **전원** 읽음 처리(전원 발송이라 본인 것만 읽으면 N−1 행이 남는다).
 */
async function resolveSupportAdminNotifications(sb: SupabaseClient, caseId: string): Promise<void> {
  await resolveAdminNotificationsForWork(sb, {
    workRef: { table: "support_cases", id: caseId },
    kinds: ["support_customer_replied", "support_case_assigned"],
  });
}

/**
 * 최종 감사 D1 (2026-11-28 · 재감사 4회 반영) — 공개 답변 1건의 정리. 규칙은 `supportReplySawMessage` 하나:
 *  ① 이 답변의 「본 시각」을 맨 먼저 기록 ② 나머지는 `reconcileSupportAdminWork`(답변 삭제와 같은 함수 · 최종 점검 M5)
 * 돌려준 값 = 아무도 안 본 고객 글 수.
 */
export async function settleAdminWorkAfterSeenReply(
  sb: SupabaseClient,
  input: { caseRow: SupportCaseRow; seenLastMessageAt: string | null; reply: { id: string; created_at: string } }
): Promise<number> {
  const c = input.caseRow;
  const replyAt = input.reply.created_at;
  // 3차 재감사: 이 답변이 「무엇을 봤나」를 **맨 먼저** 남긴다 — 판정(`supportReplySawMessage`)은 이 기록만 본다.
  // 본 시각이 없는 옛 호출 = 답변 시각까지 모두 봄(예전 「전원 읽음」과 같은 뜻).
  const seenAt = input.seenLastMessageAt && Number.isFinite(Date.parse(input.seenLastMessageAt)) ? input.seenLastMessageAt : replyAt;
  const seenRow = {
    case_id: c.id,
    event_type: "admin_reply_seen",
    actor_user_id: null,
    payload: { reply_message_id: input.reply.id, seen_at: seenAt },
  };
  let seenErr = (await sb.from("support_case_events").insert(seenRow)).error;
  if (seenErr) seenErr = (await sb.from("support_case_events").insert(seenRow)).error;
  // 4차 재감사: 기록이 끝내 실패해도 멈추지 않는다 — 이 답변은 「안 봤음」으로 계산돼 상태·알림이 남는 쪽(보수적)으로 간다.
  if (seenErr) console.error("[support] reply_seen_event_failed", { caseId: c.id, error: seenErr.message });
  return reconcileSupportAdminWork(sb, { caseRow: c, mode: "reply", fallbackLatestReplyAt: replyAt });
}

/**
 * 최종 점검 M5 (2026-11-28) — 「고객 글마다 답 받았나」(`supportReplySawMessage`)로 문의 상태·어드민 알림을 맞추는 단일 함수.
 * - reply (공개 답변 직후): 최신 어드민 답변 **앞** 고객 글만 본다.
 *     ③ 답 받은 글 알림만 전원 읽음 ④ 상태 = 아무도 안 본 글 있으면 WAITING_ADMIN, 없으면 WAITING_USER
 *     (CAS: 마지막 글 = 최신 어드민 답변. 동시 정리에서 다른 답변의 본 시각 기록 전에 읽은 쪽이 마지막이면
 *      WAITING_ADMIN 으로 남을 수 있다 — 남기는 쪽 오류(일이 숨지 않음), 다음 답변·종료 때 바로잡힘) ⑤ 남은 글 알림이 없으면 만든다.
 * - delete (어드민이 공개 답변을 지운 뒤): 문의가 WAITING_USER 이고, 남은 답변 기준으로 답을 못 받은 고객 글이 생겼으면
 *     WAITING_ADMIN 으로 되돌린다(CAS: 상태 + 읽은 `last_message_at` 그대로 · 마지막 글 시각은 바꾸지 않음) →
 *     그 글 알림이 이미 읽혔으면 받은 어드민 전원 「안 읽음」으로 되살리고, 없으면 만든다(같은 dedupe 키).
 * 돌려준 값 = 아무도 안 본(답 못 받은) 고객 글 수 — delete 는 되돌렸을 때만.
 */
async function reconcileSupportAdminWork(
  sb: SupabaseClient,
  input: {
    caseRow: SupportCaseRow;
    mode: "reply" | "delete";
    fallbackLatestReplyAt?: string | null;
    /** delete: 지운 답변 — 그 답변이 봤던 고객 글만 「새로 답 못 받음」 후보 */
    deletedReply?: { id: string; created_at: string } | null;
  }
): Promise<number> {
  const c = input.caseRow;
  // 병합 전 2차 4: 이미 WAITING_ADMIN 이어도 지운 답변이 유일한 답이던 글의 알림은 되살린다(상태는 그대로)
  if (input.mode === "delete" && c.status !== "WAITING_USER" && c.status !== "WAITING_ADMIN") return 0;
  const answers = await loadSupportCustomerMessageAnswers(sb, {
    caseId: c.id,
    onlyBeforeLatestReply: input.mode === "reply",
    fallbackLatestReplyAt: input.fallbackLatestReplyAt ?? null,
    limit: SUPPORT_MESSAGES_LIST_LIMIT,
  });
  if (!answers) {
    console.error("[support] reply_seen_settle_read_failed", { caseId: c.id, mode: input.mode });
    return 0;
  }
  const done = answers.customers.filter((m) => m.answered);
  const unanswered = answers.customers.filter((m) => !m.answered);
  const workRef = { table: "support_cases", id: c.id };
  if (input.mode === "delete") {
    if (unanswered.length === 0) return 0;
    if (c.status === "WAITING_ADMIN") {
      // 지운 답변이 본 글(답변 시각·본 시각 이하)만 — 원래부터 답을 기다리던 글의 알림(어드민이 읽었을 수 있음)은 건드리지 않는다
      const del = input.deletedReply;
      if (!del) return 0;
      const seenMap = await loadSupportAdminReplySeenAt(sb, c.id);
      if (!seenMap) return 0;
      const newly = unanswered.filter((m) =>
        Date.parse(m.created_at) <= Date.parse(del.created_at) && supportReplySawMessage(del, seenMap, m.created_at)
      );
      if (newly.length === 0) return 0;
      await reopenCustomerMessageAdminAlerts(sb, c.id, newly.map((m) => m.id));
      await notifyUnansweredCustomerMessages(sb, c, newly.map((m) => m.id));
      return newly.length;
    }
    const { data: moved, error: moveErr } = await sb
      .from("support_cases")
      .update({ status: "WAITING_ADMIN", updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "WAITING_USER")
      .eq("last_message_at", c.last_message_at)
      .select("id");
    if (moveErr) {
      console.error("[support] reply_delete_status_failed", { caseId: c.id, error: moveErr.message });
      return 0;
    }
    // 그사이 고객 글·다른 답변으로 상태가 바뀌었다 → 그쪽 경로가 맞춘다
    if (!moved || moved.length === 0) return 0;
    await reopenCustomerMessageAdminAlerts(sb, c.id, unanswered.map((m) => m.id));
    await notifyUnansweredCustomerMessages(sb, c, unanswered.map((m) => m.id));
    return unanswered.length;
  }
  const latestReplyAt = answers.latestReplyAt;
  await Promise.all([
    resolveAdminNotificationsForWork(sb, {
      workRef,
      kinds: ["support_customer_replied"],
      dedupeKeys: done.map((m) => `support_customer_replied:${m.id}`),
    }),
    resolveAdminNotificationsForWork(sb, { workRef, kinds: ["support_case_assigned"] }),
  ]);
  // 상태 맞춤 — CAS: 마지막 글 = 최신 어드민 답변(그 뒤 고객 글이 오면 DB 함수가 WAITING_ADMIN 으로 이미 맞춤 · 건드리지 않음)
  //   아무도 안 본 글 남음 → WAITING_ADMIN · 모두 답 받음 → WAITING_USER (다른 답변의 정리가 먼저 되돌려 둔 것을 바로잡음)
  if (latestReplyAt) {
    const target = unanswered.length > 0 ? { from: "WAITING_USER", to: "WAITING_ADMIN" } : { from: "WAITING_ADMIN", to: "WAITING_USER" };
    const { error: backErr } = await sb
      .from("support_cases")
      .update({ status: target.to, updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", target.from)
      .eq("last_message_at", latestReplyAt);
    if (backErr) console.error("[support] reply_unseen_status_failed", { caseId: c.id, error: backErr.message });
  }
  if (unanswered.length === 0) return 0;
  // 남은 글 알림이 없으면 만든다(같은 dedupe 키 — 있으면 그대로).
  await notifyUnansweredCustomerMessages(sb, c, unanswered.map((m) => m.id));
  return unanswered.length;
}

/** 남은 고객 글의 알림을 (없으면) 만든다 — 본문은 그 글만 읽는다. 발송은 응답 뒤(같은 판정 · 같은 dedupe 키). */
async function notifyUnansweredCustomerMessages(sb: SupabaseClient, c: SupportCaseRow, messageIds: readonly string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const bodies = await sb
    .from("support_messages")
    .select("id, body, sender_user_id")
    .eq("case_id", c.id)
    .in("id", [...messageIds]);
  if (bodies.error) {
    console.error("[support] reply_unseen_body_read_failed", { caseId: c.id, error: bodies.error.message });
    return;
  }
  // 병합 전 2차 5: 그 문의의 첫 고객 공개 글이면 제목 「새 고객 문의」(다른 경로와 같은 판정)
  const first = await sb
    .from("support_messages")
    .select("id")
    .eq("case_id", c.id)
    .eq("message_type", "PUBLIC")
    .in("sender_type", ["MEMBER", "OWNER"])
    .order("created_at", { ascending: true })
    .limit(1);
  const firstId = first.error ? "" : String(((first.data ?? [])[0] as { id?: unknown } | undefined)?.id ?? "");
  for (const m of (bodies.data ?? []) as unknown as { id: string; body: string; sender_user_id: string | null }[]) {
    notifyAdminsAfterResponse(sb, {
      caseRow: c,
      messageId: m.id,
      body: m.body,
      actorUserId: String(m.sender_user_id ?? ""),
      isNewCase: Boolean(firstId) && m.id === firstId,
    });
  }
}

/**
 * 최종 점검 M5 — 답변 삭제로 다시 「답변 필요」가 된 고객 글의 어드민 알림이 이미 읽혔으면, 받은 어드민 전원 「안 읽음」으로 되살린다.
 * (그 문의 · 그 글 dedupe 키만 · 100개씩). 실패는 기록만 — 문의 상태(WAITING_ADMIN)·탭 숫자로는 이미 보인다.
 */
async function reopenCustomerMessageAdminAlerts(sb: SupabaseClient, caseId: string, messageIds: readonly string[]): Promise<void> {
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

/** 글 본문 상한 — 새 글·어드민 답변 수정 공통 (최종 점검 L8) */
export const SUPPORT_MESSAGE_BODY_MAX = 8000;

/** 고객 글 목록 상한 (최종 감사 L11) — 한 문의 글이 이보다 많으면 **최신** 이만큼(재감사 L11-a) */
const SUPPORT_MESSAGES_LIST_LIMIT = 1000;

/**
 * 최종 감사 L7: 고객 알림(언어 읽기 · 알림함 저장 · 푸시)은 어드민 응답을 기다리게 하지 않는다 — 응답 뒤 끝까지 보장(`after`).
 * 상태·사건 기록은 응답 전에 끝나 있고, 알림은 그 뒤 한 번만 나간다(같은 dedupe 키). 실패는 기록만.
 */
function notifyRequesterAfterResponse(
  sb: SupabaseClient,
  requesterUserId: string,
  build: (lang: Awaited<ReturnType<typeof loadNotificationUserLanguage>>) => Parameters<typeof notifySupportEvent>[1]
): void {
  const work = (async () => {
    const lang = await loadNotificationUserLanguage(sb, requesterUserId);
    await notifySupportEvent(sb, build(lang));
  })().catch((err: unknown) => {
    console.error("[support] notification_failed", { userId: requesterUserId, err });
  });
  keepAliveAfterResponse(work);
}

/**
 * 재감사 D6: 어드민 알림(권한 확인·저장·푸시)은 고객 응답을 기다리게 하지 않는다 — 응답 뒤 끝까지 보장(`after`).
 * 요청 밖(크론·시험)에서는 그냥 진행된다. 실패는 알림 함수 안에서 기록하고, 남은 글은 DB 재생 함수가 다시 만든다.
 */
function notifyAdminsAfterResponse(
  sb: SupabaseClient,
  input: Parameters<typeof notifyAdminsOfCustomerMessage>[1]
): void {
  const work = notifyAdminsOfCustomerMessage(sb, input).catch((err: unknown) => {
    console.error("[support] admin_notification_failed", { caseId: input.caseRow.id, err });
  });
  keepAliveAfterResponse(work);
}

async function notifySupportEvent(
  sb: SupabaseClient,
  input: {
    userId: string;
    type:
      | "support_case_created"
      | "support_admin_replied"
      | "support_case_assigned"
      | "support_case_resolved"
      | "support_case_reopened";
    title: string;
    body: string;
    caseId: string;
    publicCaseNo: string;
    audience: "MEMBER" | "OWNER";
    storeId?: string | null;
    dedupeKey: string;
    actorUserId?: string;
    /** Override canonical deeplink. */
    routeUrl?: string;
    /** 알림함이 보는 사람 언어로 다시 그리는 문구 키 (설계 §4-3) */
    copy?: NotificationCopyMetaInput;
  }
): Promise<void> {
  const routeUrl =
    input.routeUrl ??
    (input.audience === "OWNER" && input.storeId
      ? `${buildSupportCaseRoute(input.caseId)}?storeId=${encodeURIComponent(input.storeId)}`
      : buildSupportCaseRoute(input.caseId));
  const notified = await createAndDispatchNotificationEvent(sb, {
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
    appState: "background",
  });
  if (!notified.ok && !notified.duplicate) {
    // DEF-05 (Phase 1 observability only): notification failure must not be silent.
    console.error("[support] notification_failed", {
      caseId: input.caseId,
      type: input.type,
      error: notified.error,
    });
  }
}

/** 2차 재감사 G — 방금 만든 문의가 접수에 실패했다 → 행을 지운다(세션·글·사건은 ON DELETE CASCADE). 실패는 기록. */
async function discardFailedNewCase(sb: SupabaseClient, caseId: string): Promise<void> {
  const { error } = await sb.from("support_cases").delete().eq("id", caseId);
  if (error) console.error("[support] discard_failed_case_failed", { caseId, error: error.message });
}

export async function openSupportCaseFromContext(
  sb: SupabaseClient,
  input: OpenSupportCaseInput
): Promise<
  | { ok: true; case: SupportCaseRow; sessionId: string; created: boolean }
  | { ok: false; error: string }
> {
  if (!isSupportContextEnabled(input.context)) {
    return { ok: false, error: "disabled_context" };
  }

  const norm = normalizeSupportContextForCase(input.context);

  // AUTH already done by API; then audience → store → category → issue → ref → guidance
  if (norm.audience === "OWNER") {
    const storeId = norm.ownerStoreId ?? "";
    if (!storeId) return { ok: false, error: "missing_store_id" };
    const gate = await getCachedStoreIfOwner(sb, input.userId, storeId);
    if (!gate.ok) return { ok: false, error: "store_forbidden" };
  } else if (norm.ownerStoreId) {
    return { ok: false, error: "member_case_must_not_have_store" };
  }

  const allowMissingIssue = input.allowMissingIssue !== false;
  const cat = validateSupportCategoryForOpen({
    audience: norm.audience,
    category: norm.category,
    issueType: input.issueType,
    allowMissingIssue,
  });
  if (!cat.ok) return { ok: false, error: cat.error };

  const hubPolicy = assertSupportGenericHubCategoryPolicy({
    sourceSurface: norm.sourceSurface,
    canonicalCategory: cat.category,
    explicitOtherSelection:
      input.explicitOtherSelection === true ||
      input.context.explicitOtherSelection === true,
  });
  if (!hubPolicy.ok) return { ok: false, error: hubPolicy.error };

  const ref = await assertSupportReferenceAuthority(sb, {
    userId: input.userId,
    audience: norm.audience,
    storeId: norm.ownerStoreId,
    referenceType: norm.referenceType,
    referenceId: norm.referenceId,
  });
  if (!ref.ok) return { ok: false, error: ref.error };

  const guidance = await assertSupportGuidanceForCaseOpen(sb, {
    audience: norm.audience,
    category: cat.category,
    issueType: cat.issueType,
    guidanceKey: input.guidanceKey,
    guidanceRevision: input.guidanceRevision,
    guidanceOutcome: input.guidanceOutcome,
  });
  if (!guidance.ok) return { ok: false, error: guidance.error };

  const initialSummary =
    typeof input.initialSummary === "string"
      ? input.initialSummary.trim().slice(0, 2000) || null
      : null;
  const guidanceKey = input.guidanceKey?.trim() || null;
  const guidanceRevision =
    input.guidanceRevision == null ? null : Number(input.guidanceRevision);
  const guidanceOutcome = input.guidanceOutcome?.trim() || null;

  // Dedupe key = uq_support_cases_one_active_per_key (DEF-14). Built fresh per read.
  const findActiveCase = () => {
    let q = sb
      .from("support_cases")
      .select("*")
      .eq("requester_user_id", input.userId)
      .eq("audience", norm.audience)
      .eq("category", cat.category)
      .in("status", Array.from(ACTIVE_SUPPORT_CASE_STATUSES));
    if (norm.audience === "OWNER") {
      q = q.eq("owner_store_id", norm.ownerStoreId!);
    } else {
      q = q.is("owner_store_id", null);
    }
    if (norm.referenceType && norm.referenceId) {
      q = q.eq("reference_type", norm.referenceType).eq("reference_id", norm.referenceId);
    } else {
      q = q.is("reference_type", null).is("reference_id", null);
    }
    return q.order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  };

  const { data: existing, error: existingErr } = await findActiveCase();

  if (existingErr) {
    if (isMissingSupportTable(existingErr.message ?? "")) {
      return { ok: false, error: "missing_table" };
    }
    // 최종 감사 L4: DB 오류 원문은 응답에 싣지 않는다 — 기록만, 응답은 고정 키
    console.error("[support] open_find_active_failed", { error: existingErr.message });
    return { ok: false, error: "case_open_failed" };
  }

  // DEF-01/DEF-14: one path for "an active case already exists" — used by the dedupe
  // query and by the unique-index race (23505) on insert.
  const continueActiveCase = async (
    existing: SupportCaseRow
  ): Promise<
    | { ok: true; case: SupportCaseRow; sessionId: string; created: boolean }
    | { ok: false; error: string }
  > => {
    // DEF-01: dedupe reuses the active case, but the customer's newly typed text must be
    // kept — append it through the canonical requester write path (→ WAITING_ADMIN).
    // 2차 재감사 F: 글을 먼저 붙이고(종료됐으면 case_closed) 그다음 세션 — 종료 문의에 세션을 다시 열지 않는다.
    const followUpText = (initialSummary ?? input.initialBody ?? "").trim();
    let reusedCase = existing;
    if (followUpText) {
      const appended = await postRequesterSupportMessage(sb, {
        userId: input.userId,
        caseId: existing.id,
        body: followUpText,
        // 최종 점검 L6: 위 진행 중 문의 조회(본인 · 같은 매장 — 매장 소유는 위에서 확인)에서 읽은 행 — 문의 행을 다시 읽지 않는다
        caseRow: existing,
      });
      if (!appended.ok) return { ok: false, error: appended.error };
      // SSOT §6 (F4): 고객이 다른 세부를 골라 접수했는데 같은 분야 진행 중 문의에 붙었다 → 고른 세부를 사건 기록에 남긴다.
      if (cat.issueType && cat.issueType !== existing.issue_type) {
        await recordCaseEvent(sb, {
          caseId: existing.id,
          eventType: "followup_issue_selected",
          actorUserId: input.userId,
          payload: { issue_type: cat.issueType, message_id: appended.message.id },
        });
      }
      const reread = await getSupportCaseForUser(sb, {
        userId: input.userId,
        caseId: existing.id,
      });
      if (reread.ok) reusedCase = reread.case;
    }
    const session = await ensureOpenSupportSession(sb, {
      caseId: existing.id,
      requesterUserId: input.userId,
    });
    if (!session.ok) return { ok: false, error: session.error };
    return {
      ok: true,
      case: reusedCase,
      sessionId: session.sessionId,
      created: false,
    };
  };

  if (existing) {
    const continued = await continueActiveCase(existing as SupportCaseRow);
    // 2차 재감사 F: 붙이려던 문의가 그사이 종료됐다 → 오류(500) 대신 새 문의로 접수한다.
    if (continued.ok || continued.error !== "case_closed") return continued;
  }

  const now = new Date().toISOString();
  const publicCaseNo = await allocatePublicCaseNo(sb);
  const initialBody = (input.initialBody ?? "").trim();
  const hasStructuredSummary = Boolean(initialSummary);
  // SSOT §4 (F2): 새 문의 = 어드민 미읽음 1. 첫 글이 시드(접수형 쓰기 화면은 항상 시드)면 DB 함수가 숫자를 올리지 않으므로
  // 행을 만들 때 1로 넣는다. 시드가 아닌 첫 글(옛 맥락 호출)은 DB 함수가 +1 하므로 0에서 시작.
  const firstMessageIsSeed = hasStructuredSummary || !initialBody;
  const subject = defaultSubject(cat.category, norm.sourceSurface);

  const { data: created, error: createErr } = await sb
    .from("support_cases")
    .insert({
      public_case_no: publicCaseNo,
      audience: norm.audience,
      requester_user_id: input.userId,
      owner_store_id: norm.audience === "OWNER" ? norm.ownerStoreId : null,
      category: cat.category,
      issue_type: cat.issueType,
      subject,
      source_surface: norm.sourceSurface,
      reference_type: norm.referenceType ?? null,
      reference_id: norm.referenceId ?? null,
      initial_summary: initialSummary,
      guidance_key: guidanceKey,
      guidance_revision: Number.isFinite(guidanceRevision as number)
        ? guidanceRevision
        : null,
      guidance_outcome: guidanceOutcome,
      status: "OPEN",
      priority: "NORMAL",
      admin_unread_count: firstMessageIsSeed ? 1 : 0,
      requester_unread_count: 0,
      last_message_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (createErr || !created) {
    if (isMissingSupportTable(createErr?.message ?? "")) {
      return { ok: false, error: "missing_table" };
    }
    // DEF-14: a concurrent open won the unique active-key index — continue that case.
    if ((createErr as { code?: string } | null)?.code === "23505") {
      const { data: raced } = await findActiveCase();
      if (raced) return continueActiveCase(raced as SupportCaseRow);
    }
    console.error("[support] open_create_failed", { error: createErr?.message ?? null });
    return { ok: false, error: "case_open_failed" };
  }

  const session = await ensureOpenSupportSession(sb, {
    caseId: created.id,
    requesterUserId: input.userId,
  });
  // 2차 재감사 G: 세션 실패도 접수 실패 — 빈 문의를 남기지 않는다(진행 중 키를 막는다)
  if (!session.ok) {
    await discardFailedNewCase(sb, created.id);
    return { ok: false, error: session.error };
  }

  let firstMessage: { ok: true; message: SupportMessageRow } | { ok: false; error: string };
  if (hasStructuredSummary) {
    const seed = initialBody || buildDefaultTriageSeed(cat.category, cat.issueType);
    firstMessage = await appendSupportMessage(sb, {
      caseId: created.id,
      senderUserId: input.userId,
      audience: norm.audience,
      body: seed,
      messageType: "PUBLIC",
      systemSeed: true,
    });
  } else if (initialBody) {
    firstMessage = await appendSupportMessage(sb, {
      caseId: created.id,
      senderUserId: input.userId,
      audience: norm.audience,
      body: initialBody,
      messageType: "PUBLIC",
    });
  } else {
    firstMessage = await appendSupportMessage(sb, {
      caseId: created.id,
      senderUserId: input.userId,
      audience: norm.audience,
      body: buildSupportOpenedSeedBody(),
      messageType: "PUBLIC",
      systemSeed: true,
    });
  }

  // 재감사 D9: 첫 글 저장 실패 = 접수 실패 (내용 없는 문의를 남기지 않는다)
  if (!firstMessage.ok) {
    await discardFailedNewCase(sb, created.id);
    return { ok: false, error: "first_message_failed" };
  }

  await recordCaseEvent(sb, {
    caseId: created.id,
    eventType: "case_created",
    actorUserId: input.userId,
    payload: {
      category: cat.category,
      issue_type: cat.issueType,
      issue_compatibility: cat.issueCompatibility,
      source_surface: norm.sourceSurface,
      reference_type: norm.referenceType ?? null,
      reference_id: norm.referenceId ?? null,
      guidance_key: guidanceKey,
      guidance_revision: guidanceRevision,
      guidance_outcome: guidanceOutcome,
    },
  });

  // Phase 3 A5 — no self-notification on case creation (legacy parity: the requester is
  // looking at the conversation already).
  // SSOT §3-2 (F1): admins are notified through the admin notification store (inbox + push),
  // not only the console Realtime toast (A1) which needs the console to be open.
  notifyAdminsAfterResponse(sb, {
    caseRow: created as SupportCaseRow,
    messageId: firstMessage.message.id,
    body: firstMessage.message.body,
    actorUserId: input.userId,
    isNewCase: true,
  });

  return {
    ok: true,
    case: created as SupportCaseRow,
    sessionId: session.sessionId,
    created: true,
  };
}

async function ensureOpenSupportSession(
  sb: SupabaseClient,
  input: { caseId: string; requesterUserId: string }
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const { data: open } = await sb
    .from("support_sessions")
    .select("id")
    .eq("case_id", input.caseId)
    .is("closed_at", null)
    .maybeSingle();
  if (open?.id) return { ok: true, sessionId: String(open.id) };

  const { data, error } = await sb
    .from("support_sessions")
    .insert({
      case_id: input.caseId,
      requester_user_id: input.requesterUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[support] session_open_failed", { caseId: input.caseId, error: error?.message ?? null });
    return { ok: false, error: "session_failed" };
  }
  return { ok: true, sessionId: String(data.id) };
}

export async function getSupportCaseForUser(
  sb: SupabaseClient,
  input: { userId: string; caseId: string }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  if (!isUuid(input.caseId)) return { ok: false, error: "invalid_case_id" };
  const { data, error } = await sb
    .from("support_cases")
    .select("*")
    .eq("id", input.caseId)
    .maybeSingle();
  if (error) {
    console.error("[support] case_fetch_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "case_fetch_failed" };
  }
  if (!data) return { ok: false, error: "not_found" };
  const row = data as SupportCaseRow;
  if (row.requester_user_id !== input.userId) return { ok: false, error: "forbidden" };
  if (row.audience === "OWNER" && row.owner_store_id) {
    const gate = await getCachedStoreIfOwner(sb, input.userId, row.owner_store_id);
    if (!gate.ok) return { ok: false, error: "forbidden" };
  }
  return { ok: true, case: row };
}

/**
 * 고객 문의 SSOT §3-1 (F3, Owner 2026-11-27) — 요청자 「진행 중」 목록 = 진행 중 문의
 * + 종료됐지만 아직 안 읽은 답변이 있는 문의(열어 읽으면 사라진다). PostgREST `or` 식.
 */
export function requesterVisibleActiveOrFilter(): string {
  return `status.in.(${SUPPORT_CASE_HISTORY_TAB_STATUSES.active.join(",")}),requester_unread_count.gt.0`;
}

export async function listSupportCasesForRequester(
  sb: SupabaseClient,
  input: {
    userId: string;
    audience?: "MEMBER" | "OWNER";
    storeId?: string | null;
    limit?: number;
    /** 고객 상담 내역 상태 탭 (S63) — 생략 시 전체(OWNER 기본 동작 불변) */
    status?: SupportCaseHistoryTab | null;
    /** `last_message_at|id` keyset 커서 — 지정하면(또는 `paged`) `nextCursor` 를 돌려준다 */
    cursor?: MypageListCursor | null;
    paged?: boolean;
  }
): Promise<{ ok: true; cases: SupportCaseRow[]; nextCursor: string | null } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const paged = Boolean(input.paged || input.cursor);
  let query = sb
    .from("support_cases")
    .select("*")
    .eq("requester_user_id", input.userId);

  if (input.audience) {
    query = query.eq("audience", input.audience);
  }
  if (input.audience === "OWNER" && input.storeId) {
    query = query.eq("owner_store_id", input.storeId);
  }
  if (input.status === "active") {
    query = query.or(requesterVisibleActiveOrFilter());
  } else if (input.status) {
    query = query.in("status", [...SUPPORT_CASE_HISTORY_TAB_STATUSES[input.status]]);
  }
  if (input.cursor) {
    query = query.or(mypageKeysetOrFilter(input.cursor, "last_message_at"));
  }

  query = query.order("last_message_at", { ascending: false });
  if (paged) query = query.order("id", { ascending: false });
  const { data, error } = await query.limit(paged ? limit + 1 : limit);
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    console.error("[support] requester_cases_fetch_failed", { error: error.message });
    return { ok: false, error: "cases_fetch_failed" };
  }
  const rows = (data ?? []) as SupportCaseRow[];
  if (!paged) return { ok: true, cases: rows, nextCursor: null };
  const page = sliceMypageKeysetPage(
    rows,
    limit,
    (r) => String(r.last_message_at ?? ""),
    (r) => String(r.id ?? "")
  );
  return { ok: true, cases: page.items, nextCursor: page.next_cursor };
}

/** 상담 내역 탭 개수(count 모드, S63) — 같은 조건으로 head count */
export async function countSupportCasesForRequester(
  sb: SupabaseClient,
  input: {
    userId: string;
    audience?: "MEMBER" | "OWNER";
    storeId?: string | null;
    status: SupportCaseHistoryTab;
  }
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  let query = sb
    .from("support_cases")
    .select("id", { count: "exact", head: true })
    .eq("requester_user_id", input.userId);
  query =
    input.status === "active"
      ? query.or(requesterVisibleActiveOrFilter())
      : query.in("status", [...SUPPORT_CASE_HISTORY_TAB_STATUSES[input.status]]);
  if (input.audience) query = query.eq("audience", input.audience);
  if (input.audience === "OWNER" && input.storeId) query = query.eq("owner_store_id", input.storeId);
  const { count, error } = await query;
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    console.error("[support] requester_cases_count_failed", { error: error.message });
    return { ok: false, error: "cases_fetch_failed" };
  }
  return { ok: true, count: count ?? 0 };
}

/**
 * 최종 감사 L10 — 고객센터 FAB 숫자 전용: 안 읽은 답변 수 합(`requester_unread_count`)만 읽는다.
 * 목록(GET /api/support/cases)과 같은 범위 — 본인 · audience · 사장님은 그 매장. 진행 중 + 종료됐지만 안 읽은 답변(§3-1 F3)은
 * 둘 다 「안 읽은 답변 > 0」 인 행이라 그 조건 하나로 같다. 열 1개 · 0 인 행은 읽지 않는다.
 */
export async function sumSupportRequesterUnread(
  sb: SupabaseClient,
  input: { userId: string; audience?: "MEMBER" | "OWNER"; storeId?: string | null }
): Promise<{ ok: true; unread: number } | { ok: false; error: string }> {
  let query = sb
    .from("support_cases")
    .select("requester_unread_count")
    .eq("requester_user_id", input.userId)
    .gt("requester_unread_count", 0);
  if (input.audience) query = query.eq("audience", input.audience);
  if (input.audience === "OWNER" && input.storeId) query = query.eq("owner_store_id", input.storeId);
  const { data, error } = await query.limit(100);
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    console.error("[support] requester_unread_sum_failed", { error: error.message });
    return { ok: false, error: "cases_fetch_failed" };
  }
  const unread = ((data ?? []) as { requester_unread_count?: unknown }[]).reduce(
    (acc, r) => acc + Math.max(0, Math.floor(Number(r.requester_unread_count) || 0)),
    0
  );
  return { ok: true, unread };
}

export async function listSupportMessages(
  sb: SupabaseClient,
  input: { caseId: string; includeInternal?: boolean }
): Promise<{ ok: true; messages: SupportMessageRow[] } | { ok: false; error: string }> {
  let query = sb
    .from("support_messages")
    .select("*")
    .eq("case_id", input.caseId)
    // 재감사 L11-a: 상한에 닿으면 **최신** 글을 남긴다(오래된 순 상한이면 최신 답변·읽음 기준 시각이 잘린다) — 아래에서 다시 오래된 순으로
    .order("created_at", { ascending: false });
  if (!input.includeInternal) {
    query = query.eq("message_type", "PUBLIC");
  }
  // 최종 감사 L11: 상한 없이 읽지 않는다
  const { data: newestFirst, error } = await query.limit(SUPPORT_MESSAGES_LIST_LIMIT);
  const data = newestFirst ? [...newestFirst].reverse() : newestFirst;
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    console.error("[support] messages_fetch_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "messages_fetch_failed" };
  }
  const rows = (data ?? []) as SupportMessageRow[];
  if (input.includeInternal) return { ok: true, messages: rows };
  // Customer view: a deleted admin message keeps its slot but never its text.
  return {
    ok: true,
    messages: rows.map((m) => (m.deleted_at ? { ...m, body: "" } : m)),
  };
}

/**
 * Console redesign — admin edits/deletes ONLY their own message (soft; audit in case events).
 * Bumps the case `updated_at` (어드민 콘솔 실시간 목록 갱신용 — 고객 화면은 구독이 없고 다음 GET 에서 바뀐 글을 본다).
 */
async function loadOwnAdminMessage(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; messageId: string }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("support_messages")
    .select("*")
    .eq("id", input.messageId)
    .eq("case_id", input.caseId)
    .maybeSingle();
  if (error) {
    console.error("[support] message_fetch_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "message_fetch_failed" };
  }
  const m = data as SupportMessageRow | null;
  if (!m) return { ok: false, error: "not_found" };
  if (m.sender_type !== "ADMIN" || m.sender_admin_id !== input.adminUserId) {
    return { ok: false, error: "not_own_message" };
  }
  if (m.deleted_at) return { ok: false, error: "message_deleted" };
  return { ok: true, message: m };
}

/** Bell/inbox row of `support_admin_replied` for one message (dedupe key is per message id). */
async function syncReplyNotificationBody(
  sb: SupabaseClient,
  messageId: string,
  body: string
): Promise<void> {
  const { error } = await sb
    .from("notification_events")
    .update({ body: body.slice(0, 500) })
    .eq("dedupe_key", `support_admin_replied:${messageId}`);
  if (error) {
    console.warn("[support] reply_notification_sync_failed", { messageId, error: error.message });
  }
}

export async function adminEditSupportMessage(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; messageId: string; body: string }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  // 최종 점검 L8: 새 글과 같은 정리·상한(앞뒤 공백 제거 · 8000자 — appendSupportMessage 와 같은 상수)
  const body = input.body.trim().slice(0, SUPPORT_MESSAGE_BODY_MAX);
  if (!body) return { ok: false, error: "empty_body" };
  const own = await loadOwnAdminMessage(sb, input);
  if (!own.ok) return own;
  const previousBody = own.message.body;
  if (previousBody === body) return { ok: true, message: own.message };
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("support_messages")
    .update({ body, edited_at: now })
    .eq("id", input.messageId)
    .select("*")
    .single();
  if (error || !data) {
    if (error) console.error("[support] message_edit_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "edit_failed" };
  }
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "message_edited",
    actorUserId: input.adminUserId,
    payload: { message_id: input.messageId, previous_body: previousBody },
  });
  // The customer's bell row previews the reply text — keep it in step with the edit.
  await syncReplyNotificationBody(sb, input.messageId, body);
  await sb.from("support_cases").update({ updated_at: now }).eq("id", input.caseId);
  return { ok: true, message: data as SupportMessageRow };
}

export async function adminDeleteSupportMessage(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; messageId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const own = await loadOwnAdminMessage(sb, input);
  if (!own.ok) return own;
  const now = new Date().toISOString();
  const { error } = await sb
    .from("support_messages")
    .update({ deleted_at: now })
    .eq("id", input.messageId);
  if (error) {
    console.error("[support] message_delete_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "delete_failed" };
  }
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "message_deleted",
    actorUserId: input.adminUserId,
    payload: { message_id: input.messageId },
  });
  // Never leave the deleted text visible in the customer's notification list.
  // 언어 재감사 2026-11-27 §4-3: 문장 대신 문구 키 — 알림함이 보는 사람 언어로 그린다(키 문자열 번역 계약).
  await syncReplyNotificationBody(sb, input.messageId, "support_message_deleted");
  // 2차 재감사 B: 지운 공개 답변의 알림이 **아직 안 읽힌 상태였을 때만** 고객 미읽음 −1 (이미 읽은 답변을 지워도 숫자는 그대로).
  const patch: Record<string, unknown> = { updated_at: now };
  let casUnread: number | null = null;
  if (own.message.message_type === "PUBLIC") {
    const { data: clearedRows } = await sb
      .from("notification_events")
      .update({ unread: false, read_at: now })
      .eq("dedupe_key", `support_admin_replied:${input.messageId}`)
      .eq("unread", true)
      .select("id, user_id");
    const cleared = (clearedRows ?? []) as { id?: unknown; user_id?: unknown }[];
    if (cleared.length > 0) {
      const { data: c } = await sb
        .from("support_cases")
        .select("requester_unread_count")
        .eq("id", input.caseId)
        .maybeSingle();
      const unread = Number((c as { requester_unread_count?: unknown } | null)?.requester_unread_count ?? 0);
      if (Number.isFinite(unread) && unread > 0) {
        patch.requester_unread_count = unread - 1;
        casUnread = unread;
      }
      const requester = String(cleared[0]?.user_id ?? "").trim();
      if (requester) invalidateNotificationBadgeCache(requester);
    }
  }
  let q = sb.from("support_cases").update(patch).eq("id", input.caseId);
  if (casUnread != null) q = q.eq("requester_unread_count", casUnread);
  // 남은 위험 ②: 숫자 CAS 가 빗나가면(그사이 새 답변·고객 열람) 더 내리지 않는다 — 덜 세는 일(답변 놓침)을 만들지 않는다.
  // 남는 것은 「1 더 많음」뿐이고, 고객이 문의를 열면 실제 글 기준으로 다시 맞춰진다(markSupportCaseReadForRequester).
  await q;
  // 최종 점검 M5: 지운 공개 답변이 고객 글의 유일한 답이었으면 문의를 「답변 필요」로 되돌리고 그 글 알림을 다시 살린다
  // (답변 정리와 같은 판정 `reconcileSupportAdminWork`). 실패는 기록만 — 삭제는 이미 끝났다.
  if (own.message.message_type === "PUBLIC") {
    const latest = await getSupportCaseForAdmin(sb, input.caseId);
    if (latest.ok) {
      await reconcileSupportAdminWork(sb, {
        caseRow: latest.case,
        mode: "delete",
        deletedReply: { id: own.message.id, created_at: own.message.created_at },
      });
    }
  }
  return { ok: true };
}

export async function appendSupportMessage(
  sb: SupabaseClient,
  input: {
    caseId: string;
    senderUserId?: string;
    senderAdminId?: string;
    audience?: "MEMBER" | "OWNER";
    body: string;
    messageType: "PUBLIC" | "INTERNAL_NOTE";
    systemSeed?: boolean;
  }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const body = input.body.trim().slice(0, SUPPORT_MESSAGE_BODY_MAX);
  if (!body) return { ok: false, error: "empty_body" };

  let senderType: "MEMBER" | "OWNER" | "ADMIN" | "SYSTEM" = "SYSTEM";
  if (input.senderAdminId) {
    senderType = "ADMIN";
  } else if (input.audience === "OWNER") {
    senderType = "OWNER";
  } else if (input.senderUserId) {
    senderType = "MEMBER";
  }

  // DEF-05 (Phase 2): message insert + case status/unread/first-response update run in ONE
  // DB transaction (support_append_message). Transition rules are unchanged:
  // ADMIN PUBLIC → WAITING_USER (+requester unread, first response stamped once);
  // MEMBER/OWNER (non-seed) → WAITING_ADMIN (+admin unread); otherwise last_message_at only.
  const { data: message, error } = await sb.rpc("support_append_message", {
    p_case_id: input.caseId,
    p_sender_type: senderType, // derived server-side above, never from the request body
    p_sender_user_id: input.senderUserId ?? null,
    p_sender_admin_id: input.senderAdminId ?? null,
    p_message_type: input.messageType,
    p_body: body,
    p_system_seed: input.systemSeed === true,
  });

  if (error || !message) {
    // 재감사 D4: DB 함수가 잠금 안에서 종료 문의 공개 글을 거부 → 화면이 아는 오류 코드로
    if (/support_case_closed/.test(error?.message ?? "")) return { ok: false, error: "case_closed" };
    console.error("[support] append_message_failed", {
      caseId: input.caseId,
      senderType,
      error: error?.message ?? "insert_failed",
    });
    return { ok: false, error: "message_save_failed" };
  }

  return { ok: true, message: message as SupportMessageRow };
}

export async function postRequesterSupportMessage(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    body: string;
    /** 최종 점검 L6: 호출 측이 이미 본인·매장 확인으로 읽은 문의 행 — 주면 다시 읽지 않는다(id·요청자가 같을 때만) */
    caseRow?: SupportCaseRow | null;
  }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const gate =
    input.caseRow && input.caseRow.id === input.caseId && input.caseRow.requester_user_id === input.userId
      ? ({ ok: true, case: input.caseRow } as const)
      : await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  if (gate.case.status === "RESOLVED" || gate.case.status === "ARCHIVED") {
    return { ok: false, error: "case_closed" };
  }
  const res = await appendSupportMessage(sb, {
    caseId: input.caseId,
    senderUserId: input.userId,
    audience: gate.case.audience,
    body: input.body,
    messageType: "PUBLIC",
  });
  if (!res.ok) return res;

  // SSOT §3-2 (F1): assigned admin, or every support admin when unassigned. (재감사 D6: 응답 뒤)
  notifyAdminsAfterResponse(sb, {
    caseRow: gate.case,
    messageId: res.message.id,
    body: input.body,
    actorUserId: input.userId,
    isNewCase: false,
  });

  return res;
}


export type AdminSupportListQuery = {
  /** Legacy single filter (deep links / older clients). Ignored when `tab` is set. */
  filter?: AdminSupportListFilter;
  /** Console status tab (ADMIN_SUPPORT_TABS). */
  tab?: AdminSupportTab;
  audience?: "MEMBER" | "OWNER" | null;
  /** SUPPORT_CATEGORY_GROUPS id. */
  group?: string | null;
  assignee?: "ME" | "UNASSIGNED" | null;
  adminUserId?: string | null;
  /** Only cases whose last message is 24h+ old. */
  stale?: boolean;
  search?: string;
  /** Exact business reference (e.g. STORE_ORDER + order id) — deep links from domain Admin. */
  referenceType?: string | null;
  referenceId?: string | null;
  /** Owner store context (`owner_store_id`) — deep links from the store hub. */
  ownerStoreId?: string | null;
  /** 커뮤니티 문의 범위 (`?group=community`) — `support-community-filter` */
  scope?: SupportCaseScope;
  /** 이의신청만 (`?type=appeal`) */
  kind?: SupportCaseKind;
  /** Page size (1..200, default 50). */
  limit?: number;
  /** Row offset for server-side pagination (default 0). */
  offset?: number;
};

/** Strip characters that would break a PostgREST `or()` expression. */
function sanitizeSearchToken(raw: string): string {
  return raw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function listSupportCasesForAdmin(
  sb: SupabaseClient,
  input: AdminSupportListQuery
): Promise<
  | { ok: true; cases: SupportCaseRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: string }
> {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 200);
  const offset = Math.max(Math.floor(input.offset ?? 0), 0);
  const tab = input.tab ?? null;
  const actionableOldestFirst = tab
    ? tab === "ACTIONABLE"
    : input.filter === "ACTIONABLE" || input.filter === "WAITING_ADMIN" || input.filter === "UNASSIGNED";
  let query = sb
    .from("support_cases")
    .select("*", { count: "exact" })
    .order("last_message_at", { ascending: actionableOldestFirst })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (tab) {
    // 탭 상태 = 처리 대기 레지스트리·통합 대시보드 「고객지원 미처리」와 같은 필터 함수
    query = applySupportCaseTabFilter(query, tab);
  } else {
    switch (input.filter) {
      case "MEMBER":
        query = query.eq("audience", "MEMBER");
        break;
      case "OWNER":
        query = query.eq("audience", "OWNER");
        break;
      case "UNASSIGNED":
        query = query.is("assigned_admin_id", null).in("status", ["OPEN", "WAITING_ADMIN", "WAITING_USER"]);
        break;
      case "WAITING_ADMIN":
        query = query.eq("status", "WAITING_ADMIN");
        break;
      case "ACTIONABLE":
        query = applySupportCaseTabFilter(query, "ACTIONABLE");
        break;
      case "WAITING_USER":
        query = query.eq("status", "WAITING_USER");
        break;
      case "RESOLVED":
        query = query.eq("status", "RESOLVED");
        break;
      default:
        break;
    }
  }

  if (input.audience === "MEMBER" || input.audience === "OWNER") {
    query = query.eq("audience", input.audience);
  }
  // `?group=trade|community` 는 도메인 범위(scope)다 — 같은 값을 카테고리 그룹(category = TRADE 만)으로 겹쳐 걸면
  // 범위에 속한 다른 카테고리 문의(예: AD 카테고리의 거래 홍보 주문 문의)가 빠진다. 범위가 있으면 범위만 쓴다.
  const group = input.scope ? null : getSupportCategoryGroup(input.group);
  if (group) query = query.in("category", [...group.categories]);
  if (input.assignee === "UNASSIGNED") {
    query = query.is("assigned_admin_id", null);
  } else if (input.assignee === "ME" && input.adminUserId) {
    query = query.eq("assigned_admin_id", input.adminUserId);
  }
  if (input.stale) {
    query = query.lt("last_message_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  }

  if (input.referenceType) query = query.eq("reference_type", input.referenceType);
  if (input.referenceId && isUuid(input.referenceId)) query = query.eq("reference_id", input.referenceId);
  if (input.ownerStoreId && isUuid(input.ownerStoreId)) query = query.eq("owner_store_id", input.ownerStoreId);
  if (input.scope === "community" || input.scope === "trade") {
    // 홍보 주문 참조는 주문 도메인으로 나눈다 (거래 Admin 설계 v2 §G-4) — DB 계산 열로 판정 (주문 수 상한 없음)
    query = input.scope === "community" ? query.or(supportCommunityScopeOrFilter()) : query.or(supportTradeScopeOrFilter());
  }
  if (input.kind === "appeal") {
    // 거래·커뮤니티 문의 화면은 각 범위의 이의신청 · 중앙 고객지원(범위 없음)은 전 도메인 이의신청 (G-07)
    query = query.or(
      input.scope === "trade"
        ? supportTradeAppealOrFilter()
        : input.scope === "community"
          ? supportAppealOrFilter()
          : supportAllDomainAppealOrFilter()
    );
  }

  const search = (input.search ?? "").trim();
  if (search) {
    if (isUuid(search)) {
      // CUT D — match case id, business reference, or Owner store context
      query = query.or(
        `id.eq.${search},reference_id.eq.${search},owner_store_id.eq.${search},requester_user_id.eq.${search}`
      );
    } else if (/^SC-\d+$/i.test(search)) {
      query = query.ilike("public_case_no", search);
    } else {
      // Console redesign — customer name / email / store name / first words.
      const token = sanitizeSearchToken(search);
      if (token) {
        const like = `%${token}%`;
        const [{ data: people }, { data: stores }] = await Promise.all([
          sb
            .from("profiles")
            .select("id")
            .or(`display_name.ilike.${like},nickname.ilike.${like},email.ilike.${like}`)
            .limit(50),
          sb.from("stores").select("id").ilike("store_name", like).limit(50),
        ]);
        const personIds = ((people ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
        const storeIds = ((stores ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
        const ors = [`initial_summary.ilike.${like}`, `subject.ilike.${like}`];
        if (personIds.length) ors.push(`requester_user_id.in.(${personIds.join(",")})`);
        if (storeIds.length) ors.push(`owner_store_id.in.(${storeIds.join(",")})`);
        query = query.or(ors.join(","));
      }
    }
  }

  const { data, error, count } = await query;
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    console.error("[support] admin_cases_fetch_failed", { error: error.message });
    return { ok: false, error: "cases_fetch_failed" };
  }
  const cases = (data ?? []) as SupportCaseRow[];
  return { ok: true, cases, total: count ?? offset + cases.length, limit, offset };
}

/** Console tab badges — global per-status counts (independent of secondary filters). */
export async function countSupportCasesByTab(
  sb: SupabaseClient
): Promise<Record<AdminSupportTab, number> | null> {
  const results = await Promise.all(
    ADMIN_SUPPORT_TABS.map(async (tab) => {
      const { count, error } = await applySupportCaseTabFilter(
        sb.from("support_cases").select("id", { count: "exact", head: true }),
        tab
      );
      return [tab, error ? null : (count ?? 0)] as const;
    })
  );
  if (results.some(([, n]) => n == null)) return null;
  return Object.fromEntries(results) as Record<AdminSupportTab, number>;
}

/** DEF-09 — Admin queue display fields (read-only; never written to support_cases). */
export type SupportCaseAdminDisplayRow = SupportCaseRow & {
  requester_display_name: string | null;
  requester_email: string | null;
  owner_store_name: string | null;
};

/**
 * DEF-09 — restore legacy Admin member identification (display name / email / store)
 * using the same read pattern as `enrichAdminNoteThreadsForDisplay`.
 * Display-only: lookup failure degrades to null fields, never fails the list.
 */
export async function enrichSupportCasesForAdminDisplay(
  sb: SupabaseClient,
  cases: SupportCaseRow[]
): Promise<SupportCaseAdminDisplayRow[]> {
  if (cases.length === 0) return [];
  const userIds = [...new Set(cases.map((c) => c.requester_user_id).filter(Boolean))];
  const storeIds = [
    ...new Set(cases.map((c) => c.owner_store_id).filter((v): v is string => Boolean(v))),
  ];
  const [profilesRes, storesRes] = await Promise.all([
    sb.from("profiles").select("id, display_name, nickname, email").in("id", userIds),
    storeIds.length > 0
      ? sb.from("stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (profilesRes.error || storesRes.error) {
    console.error("[support] admin_display_enrich_failed", {
      profiles: profilesRes.error?.message ?? null,
      stores: storesRes.error?.message ?? null,
    });
  }
  const profileById = new Map<
    string,
    { display_name?: string | null; nickname?: string | null; email?: string | null }
  >();
  for (const p of (profilesRes.data ?? []) as {
    id?: string;
    display_name?: string | null;
    nickname?: string | null;
    email?: string | null;
  }[]) {
    if (p.id) profileById.set(String(p.id), p);
  }
  const storeNameById = new Map<string, string>();
  for (const st of (storesRes.data ?? []) as { id?: string; store_name?: string | null }[]) {
    const name = String(st.store_name ?? "").trim();
    if (st.id && name) storeNameById.set(String(st.id), name);
  }
  return cases.map((c) => {
    const profile = profileById.get(c.requester_user_id);
    return {
      ...c,
      requester_display_name:
        String(profile?.display_name ?? "").trim() ||
        String(profile?.nickname ?? "").trim() ||
        null,
      requester_email: String(profile?.email ?? "").trim() || null,
      owner_store_name: c.owner_store_id ? storeNameById.get(c.owner_store_id) ?? null : null,
    };
  });
}

export async function getSupportCaseForAdmin(
  sb: SupabaseClient,
  caseId: string
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  if (!isUuid(caseId)) return { ok: false, error: "invalid_case_id" };
  const { data, error } = await sb.from("support_cases").select("*").eq("id", caseId).maybeSingle();
  if (error) {
    console.error("[support] admin_case_fetch_failed", { caseId, error: error.message });
    return { ok: false, error: "case_fetch_failed" };
  }
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, case: data as SupportCaseRow };
}

export async function adminReplySupportCase(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    caseId: string;
    body: string;
    internalNote?: boolean;
    /**
     * 최종 감사 D1: 어드민 상세 화면이 보여 준 문의의 `last_message_at`. 주면 그 시각까지의 고객 글 알림만 읽음 처리하고,
     * 뒤에 온 고객 글이 있으면 문의를 「답변 필요」(WAITING_ADMIN)로 남긴다. 없으면(옛 호출) 문의의 어드민 알림 전부 읽음.
     */
    seenLastMessageAt?: string | null;
  }
): Promise<
  | { ok: true; message: SupportMessageRow; unseenCustomerMessages: number }
  | { ok: false; error: string }
> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  // DEF-02: a closed case returns to an active state only via reopenSupportCase
  // (reopened event + session + notification). Internal notes do not change state.
  if (
    !input.internalNote &&
    (gate.case.status === "RESOLVED" || gate.case.status === "ARCHIVED")
  ) {
    return { ok: false, error: "case_closed" };
  }

  const res = await appendSupportMessage(sb, {
    caseId: input.caseId,
    senderAdminId: input.adminUserId,
    body: input.body,
    messageType: input.internalNote ? "INTERNAL_NOTE" : "PUBLIC",
  });
  if (!res.ok) return res;

  let unseenCustomerMessages = 0;
  if (!input.internalNote) {
    const seen = typeof input.seenLastMessageAt === "string" ? input.seenLastMessageAt.trim() : "";
    // 최종 감사 D1 (3차 재감사): 모든 공개 답변이 「본 시각」을 남기고, 본 글까지만 끝난 일로 한다.
    // 본 시각 없는 호출 = 답변 시각까지 모두 봄.
    unseenCustomerMessages = await settleAdminWorkAfterSeenReply(sb, {
      caseRow: gate.case,
      seenLastMessageAt: seen || null,
      reply: { id: res.message.id, created_at: res.message.created_at },
    });
    // 4절 문구 (docs/audit/notification-defect-fix-design-2026-10-28.md): 제목에 내부 문의번호를 넣지 않는다.
    // 최종 감사 L7: 고객 알림·푸시는 응답 뒤
    const c = gate.case;
    const replyBody = input.body;
    const messageId = res.message.id;
    notifyRequesterAfterResponse(sb, c.requester_user_id, (replyLang) => ({
      userId: c.requester_user_id,
      type: "support_admin_replied",
      title: notifySafeT(replyLang, "notify_support_admin_replied_title"),
      body: replyBody,
      copy: { titleKey: "notify_support_admin_replied_title" },
      caseId: c.id,
      publicCaseNo: c.public_case_no,
      audience: c.audience,
      storeId: c.owner_store_id,
      dedupeKey: `support_admin_replied:${messageId}`,
      actorUserId: input.adminUserId,
    }));
  }

  // SSOT §8 F10: no "reply + close" in one call — a close right after the reply would hide
  // the answer before the customer reads it. Closing is its own action.
  return { ok: true, message: res.message, unseenCustomerMessages };
}

export async function adminUpdateSupportCaseStatus(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    caseId: string;
    status: SupportCaseStatus;
    /**
     * 최종 점검 M6: 진행 중 문의를 종료(RESOLVED)할 때 어드민 화면이 본 문의 `last_message_at`. 주면 그 뒤 새 글이 왔을 때
     * 닫지 않는다(`case_updated` → 화면이 다시 읽어 새 고객 글을 보여 준다). 없으면(옛 호출) 지금과 같다. 보관·보관 해제는 무시.
     */
    seenLastMessageAt?: string | null;
  }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  // DEF-15: same-status transition is a no-op (no write, no event, no notification) —
  // same idempotency contract as mark-read.
  if (gate.case.status === input.status) {
    return { ok: true, case: gate.case };
  }
  // SSOT §8 F15: this path only closes (active → RESOLVED), archives (RESOLVED → ARCHIVED) or
  // unarchives (ARCHIVED → RESOLVED). Closed → active goes through reopenSupportCase only
  // (session · reopened event · customer notification).
  if (input.status !== "RESOLVED" && input.status !== "ARCHIVED") {
    return { ok: false, error: "invalid_transition" };
  }
  // Console redesign — 보관 only from 종료; 보관 해제 = back to 종료 (silent, keeps resolved_at).
  if (input.status === "ARCHIVED" && gate.case.status !== "RESOLVED") {
    return { ok: false, error: "not_closed" };
  }
  const unarchive = gate.case.status === "ARCHIVED" && input.status === "RESOLVED";

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: now,
  };
  const closing = input.status === "RESOLVED" && !unarchive;
  if (closing) {
    patch.resolved_at = now;
  }
  // 최종 점검 M6: 본 뒤 새 글이 왔으면 닫지 않는다(고객 「확인했어요」와 같은 보호)
  const seen = closing && typeof input.seenLastMessageAt === "string" ? input.seenLastMessageAt.trim() : "";
  if (seen && !sameInstant(seen, gate.case.last_message_at)) {
    return { ok: false, error: "case_updated" };
  }
  // SSOT §8 F6: a closed case needs no admin action — its admin unread count goes to 0.
  if (closing || input.status === "ARCHIVED") {
    patch.admin_unread_count = 0;
  }
  if (input.status === "ARCHIVED") {
    patch.archived_at = now;
  }
  if (unarchive) {
    patch.archived_at = null;
  }

  // CAS on the status we validated — two admins acting at once: exactly one transition,
  // one status_changed event, one customer notification.
  let statusQ = sb
    .from("support_cases")
    .update(patch)
    .eq("id", input.caseId)
    .eq("status", gate.case.status);
  // M6: 위 비교와 쓰기 사이에 새 글이 와도 닫지 않는다
  if (seen) statusQ = statusQ.eq("last_message_at", gate.case.last_message_at);
  const { data, error } = await statusQ.select("*").maybeSingle();
  if (error || !data) {
    // DEF-14: moving a closed case back to active collides with another active case on the
    // same key (customer already opened a new one) — surface a stable code.
    if ((error as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "active_case_exists" };
    }
    if (!error) {
      // Lost the race: another admin changed the status first.
      const latest = await getSupportCaseForAdmin(sb, input.caseId);
      if (latest.ok && latest.case.status === input.status) {
        return { ok: true, case: latest.case };
      }
      // M6: 상태는 그대로인데 마지막 글이 바뀌었다(본 뒤 새 글) → 화면이 다시 읽게
      if (seen && latest.ok && latest.case.status === gate.case.status) return { ok: false, error: "case_updated" };
      return { ok: false, error: "status_conflict" };
    }
    console.error("[support] status_update_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "update_failed" };
  }

  if (closing) {
    await sb
      .from("support_sessions")
      .update({ closed_at: now, last_seen_at: now })
      .eq("case_id", input.caseId)
      .is("closed_at", null);
  }
  if (closing || input.status === "ARCHIVED") {
    await resolveSupportAdminNotifications(sb, input.caseId);
  }

  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "status_changed",
    actorUserId: input.adminUserId,
    payload: { status: input.status },
  });

  if (closing) {
    // 최종 감사 L7: 고객 알림·푸시는 응답 뒤
    notifyRequesterAfterResponse(sb, gate.case.requester_user_id, (resolvedLang) => ({
      userId: gate.case.requester_user_id,
      type: "support_case_resolved",
      title: notifySafeT(resolvedLang, "notify_support_case_resolved_title"),
      // Phase 3 A5 — fixed copy; `subject` is an internal "CATEGORY · surface" token.
      body: notifySafeT(resolvedLang, "notify_support_case_resolved_body"),
      copy: { titleKey: "notify_support_case_resolved_title", messageKey: "notify_support_case_resolved_body" },
      caseId: gate.case.id,
      publicCaseNo: gate.case.public_case_no,
      audience: gate.case.audience,
      storeId: gate.case.owner_store_id,
      dedupeKey: `support_case_resolved:${gate.case.id}:${now}`,
      actorUserId: input.adminUserId,
    }));
  }

  return { ok: true, case: data as SupportCaseRow };
}

export async function adminAssignSupportCase(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; assigneeAdminId: string | null }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  // 최종 감사 L1: 종료·보관 문의는 담당을 바꾸지 않는다(지정 알림·푸시가 끝난 일에 나가지 않게) — 재오픈 뒤에 지정
  if (gate.case.status === "RESOLVED" || gate.case.status === "ARCHIVED") {
    return { ok: false, error: "case_closed" };
  }

  // R13: only an ACTIVE admin can be the assignee (assignee receives admin notifications).
  if (input.assigneeAdminId) {
    const authority = await resolveAdminRecipientAuthority(sb, input.assigneeAdminId).catch(
      () => ({ active: false }) as const
    );
    if (!authority.active) return { ok: false, error: "assignee_not_active_admin" };
    // 재감사 D2: 담당자 = 문의를 열 수 있는 사람(support 권한)
    if (!authorityAllows(authority, "support")) return { ok: false, error: "assignee_not_support_admin" };
  }
  // 재감사 D11: 이미 그 사람이 담당이면 아무것도 바꾸지 않는다(두 번 눌러도 알림 1건)
  if ((gate.case.assigned_admin_id ?? null) === (input.assigneeAdminId ?? null)) {
    return { ok: true, case: gate.case };
  }

  // 최종 감사 L1: CAS — 읽은 담당자 그대로이고 아직 진행 중일 때만 바꾼다(두 어드민이 동시에 지정하면 한 번만 · 그사이 종료면 거부)
  const previousAssignee = gate.case.assigned_admin_id ?? null;
  let assignQ = sb
    .from("support_cases")
    .update({
      assigned_admin_id: input.assigneeAdminId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.caseId)
    .in("status", Array.from(ACTIVE_SUPPORT_CASE_STATUSES));
  assignQ = previousAssignee ? assignQ.eq("assigned_admin_id", previousAssignee) : assignQ.is("assigned_admin_id", null);
  const { data, error } = await assignQ.select("*").maybeSingle();
  if (error) {
    console.error("[support] assign_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "assign_failed" };
  }
  if (!data) {
    const latest = await getSupportCaseForAdmin(sb, input.caseId);
    if (latest.ok && (latest.case.status === "RESOLVED" || latest.case.status === "ARCHIVED")) {
      return { ok: false, error: "case_closed" };
    }
    // 다른 어드민이 먼저 같은 사람으로 지정했으면 같은 결과(멱등) — 알림은 그쪽에서 나갔다
    if (latest.ok && (latest.case.assigned_admin_id ?? null) === (input.assigneeAdminId ?? null)) {
      return { ok: true, case: latest.case };
    }
    return { ok: false, error: "case_updated" };
  }

  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "assigned",
    actorUserId: input.adminUserId,
    payload: { assigned_admin_id: input.assigneeAdminId },
  });

  // Phase 3 A5 / Owner decision D2 — assignment is internal; no customer notification.
  // SSOT §8 F14: an admin assigned by someone else gets one admin notification.
  const assignee = input.assigneeAdminId?.trim() || "";
  if (assignee && assignee !== input.adminUserId) {
    const c = data as SupportCaseRow;
    const notified = await createAdminNotification(sb, {
      recipientAdminIds: [assignee],
      kind: "support_case_assigned",
      // 2차 재감사 I: 지정 알림도 support 권한이 있어야 읽기·푸시
      requiredPermission: "support",
      title: translateBy("ko", "admin_support_notify_assigned_title", { no: c.public_case_no }),
      body: translateBy("ko", "admin_support_notify_assigned_body"),
      linkUrl: buildAdminSupportCaseRoute(c.id),
      workRef: { table: "support_cases", id: c.id },
      dedupeKey: `support_case_assigned:${c.id}:${assignee}:${new Date().toISOString()}`,
      actorUserId: input.adminUserId,
      push: true,
    });
    if (!notified.ok) {
      console.error("[support] admin_notification_failed", {
        caseId: c.id,
        type: "support_case_assigned",
        error: notified.error,
      });
    }
  }

  return { ok: true, case: data as SupportCaseRow };
}

export async function adminSetSupportCasePriority(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; priority: SupportCasePriority }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  const { data, error } = await sb
    .from("support_cases")
    .update({ priority: input.priority, updated_at: new Date().toISOString() })
    .eq("id", input.caseId)
    .select("*")
    .single();
  if (error || !data) {
    if (error) console.error("[support] priority_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "priority_failed" };
  }
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "priority_changed",
    actorUserId: input.adminUserId,
    payload: { priority: input.priority },
  });
  return { ok: true, case: data as SupportCaseRow };
}

export async function reopenSupportCase(
  sb: SupabaseClient,
  /** 고객 문의 SSOT §2 (2차 재감사 J): 재오픈은 어드민만. `isAdmin` 은 옛 호출 호환용 — 값과 무관하게 어드민 판정. */
  input: { userId: string; caseId: string; isAdmin?: boolean }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  if (gate.case.status !== "RESOLVED" && gate.case.status !== "ARCHIVED") {
    return { ok: false, error: "not_closed" };
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("support_cases")
    .update({
      status: "OPEN",
      resolved_at: null,
      archived_at: null,
      updated_at: now,
      last_message_at: now,
    })
    .eq("id", input.caseId)
    // SSOT §8 F10: CAS on the closed status we read — two reopen clicks = one transition.
    .eq("status", gate.case.status)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    if ((error as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "active_case_exists" };
    }
    if (!error) return { ok: false, error: "status_conflict" };
    console.error("[support] reopen_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "reopen_failed" };
  }

  await ensureOpenSupportSession(sb, {
    caseId: input.caseId,
    requesterUserId: gate.case.requester_user_id,
  });

  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "reopened",
    actorUserId: input.userId,
    payload: {},
  });

  // Phase 3 A5 — notify only when someone else (admin) reopened it; never self-notify.
  if (input.userId !== gate.case.requester_user_id) {
    // 최종 감사 L7: 고객 알림·푸시는 응답 뒤
    notifyRequesterAfterResponse(sb, gate.case.requester_user_id, (reopenedLang) => ({
      userId: gate.case.requester_user_id,
      type: "support_case_reopened",
      title: notifySafeT(reopenedLang, "notify_support_case_reopened_title"),
      body: notifySafeT(reopenedLang, "notify_support_case_reopened_body"),
      copy: { titleKey: "notify_support_case_reopened_title", messageKey: "notify_support_case_reopened_body" },
      caseId: gate.case.id,
      publicCaseNo: gate.case.public_case_no,
      audience: gate.case.audience,
      storeId: gate.case.owner_store_id,
      dedupeKey: `support_case_reopened:${gate.case.id}:${now}`,
      actorUserId: input.userId,
    }));
  }

  return { ok: true, case: data as SupportCaseRow };
}

/**
 * 접수형 문의 — 고객(요청자)이 답변을 보고 「확인했어요」 = 종료 (Owner 「접수형 1단계」 2026-11-10).
 * - 요청자 본인 문의만. 이미 종료면 그대로 성공(멱등).
 * - 본인 행동이므로 알림을 보내지 않는다. 종료된 문의는 요청자 화면 목록에서 사라진다.
 * - CAS: 읽은 상태 그대로일 때만 바꾼다(관리자 동시 처리와 한 번만 전이).
 */
export async function requesterCloseSupportCase(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    /**
     * 2차 재감사 A: 고객 화면이 본 문의의 `last_message_at`. 그 뒤에 새 글(어드민 답변)이 왔으면 닫지 않는다
     * (`case_updated` → 화면이 다시 읽어 새 답변을 보여 준다). 없으면(옛 호출) 서버가 읽은 값으로만 비교한다.
     */
    seenLastMessageAt?: string | null;
  }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  if (gate.case.status === "RESOLVED" || gate.case.status === "ARCHIVED") {
    return { ok: true, case: gate.case };
  }
  // 최종 감사 L6: 「확인했어요」 = 답변을 본 뒤에만(WAITING_USER). 답변 전(OPEN·WAITING_ADMIN)에는 닫지 않는다 —
  // 화면도 답변 완료 상태에서만 버튼을 보인다(계약 §2·§6).
  if (gate.case.status !== "WAITING_USER") {
    return { ok: false, error: "invalid_transition" };
  }
  const seen = typeof input.seenLastMessageAt === "string" ? input.seenLastMessageAt.trim() : "";
  if (seen && !sameInstant(seen, gate.case.last_message_at)) {
    return { ok: false, error: "case_updated" };
  }
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("support_cases")
    .update({
      status: "RESOLVED",
      resolved_at: now,
      updated_at: now,
      requester_unread_count: 0,
      // SSOT §8 F6
      admin_unread_count: 0,
    })
    .eq("id", input.caseId)
    .eq("status", gate.case.status)
    // 2차 재감사 A: 읽은 상태 그대로일 때만(위 비교와 쓰기 사이에 새 글이 와도 닫지 않는다)
    .eq("last_message_at", gate.case.last_message_at)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[support] requester_close_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "close_failed" };
  }
  if (!data) {
    const latest = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
    if (latest.ok && (latest.case.status === "RESOLVED" || latest.case.status === "ARCHIVED")) {
      return { ok: true, case: latest.case };
    }
    return { ok: false, error: "case_updated" };
  }
  await sb
    .from("support_sessions")
    .update({ closed_at: now, last_seen_at: now })
    .eq("case_id", input.caseId)
    .is("closed_at", null);
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "status_changed",
    actorUserId: input.userId,
    payload: { status: "RESOLVED", by: "requester" },
  });
  // SSOT §8 F5: the customer closed it after reading — no unread bell rows left behind for a
  // case that disappears from their list.
  await markSupportCaseNotificationsRead(sb, { userId: input.userId, caseId: input.caseId });
  await resolveSupportAdminNotifications(sb, input.caseId);
  return { ok: true, case: data as SupportCaseRow };
}

/** SSOT §2 (F7, Owner 2026-11-27 「7일」): 답변 완료 뒤 고객 글 없이 지나면 자동 종료하는 기간. */
export const SUPPORT_AUTO_CLOSE_AFTER_DAYS = 7;

/**
 * 자동 종료는 새 cron 없이 `/api/cron/admin-notification-delivery`(5분)에 붙인다 —
 * 매시 첫 실행(UTC 분 0~4)에만 = 하루 24번 조회 1건씩(요청 예산 docs/request-budget-ssot.md).
 */
export function shouldRunSupportAutoClose(now: Date): boolean {
  return now.getUTCMinutes() < 5;
}

/**
 * SSOT §2 (F7) — WAITING_USER 이고 마지막 글 뒤 7일이 지난 문의를 자동 종료한다.
 * - 고객 「확인했어요」와 같은 취급: 고객 알림 없음 · 어드민 미읽음 0 · 사건 `status_changed` `by: "auto_7d"`.
 * - 고객이 아직 안 읽은 답변(requester_unread_count>0)은 그대로 둔다 → §3-1 대로 종료돼도 보인다.
 * - CAS: 읽은 상태(WAITING_USER)·마지막 글 시각이 그대로일 때만 바꾼다(그사이 고객이 쓰면 건너뜀).
 */
export async function autoCloseStaleAnsweredSupportCases(
  sb: SupabaseClient,
  opts?: { now?: Date; limit?: number }
): Promise<{ ok: true; closed: number } | { ok: false; error: string }> {
  const nowDate = opts?.now ?? new Date();
  const cutoff = new Date(nowDate.getTime() - SUPPORT_AUTO_CLOSE_AFTER_DAYS * 86_400_000).toISOString();
  const { data, error } = await sb
    .from("support_cases")
    .select("id, last_message_at")
    .eq("status", "WAITING_USER")
    .lt("last_message_at", cutoff)
    .order("last_message_at", { ascending: true })
    .limit(Math.min(Math.max(opts?.limit ?? 100, 1), 500));
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: true, closed: 0 };
    return { ok: false, error: error.message };
  }
  const now = nowDate.toISOString();
  let closed = 0;
  for (const row of (data ?? []) as { id: string; last_message_at: string }[]) {
    const { data: updated, error: upErr } = await sb
      .from("support_cases")
      .update({ status: "RESOLVED", resolved_at: now, updated_at: now, admin_unread_count: 0 })
      .eq("id", row.id)
      .eq("status", "WAITING_USER")
      .eq("last_message_at", row.last_message_at)
      .select("id")
      .maybeSingle();
    if (upErr || !updated) continue;
    closed += 1;
    await sb
      .from("support_sessions")
      .update({ closed_at: now, last_seen_at: now })
      .eq("case_id", row.id)
      .is("closed_at", null);
    await recordCaseEvent(sb, {
      caseId: row.id,
      eventType: "status_changed",
      actorUserId: null,
      payload: { status: "RESOLVED", by: "auto_7d" },
    });
    await resolveSupportAdminNotifications(sb, row.id);
  }
  return { ok: true, closed };
}

/**
 * Mark requester unread → 0.
 * IDEMPOTENT: when already 0, perform **no UPDATE** (no `updated_at` bump) — 같은 화면을 다시 열어도 쓰기 0.
 * (고객 화면은 실시간 구독이 없다 — 숫자는 GET 으로만 다시 읽는다. 최종 감사 L12 주석 정정)
 */
export async function markSupportCaseReadForRequester(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    /** 2차 재감사 E: 화면에 돌려준 글 목록의 기준 시각(문의 `last_message_at`). 그 뒤 새 글이 왔으면 읽음 0 으로 만들지 않는다 */
    seenLastMessageAt?: string | null;
    /** 최종 감사 L11: 호출 측이 이미 본인 확인으로 읽은 문의 행 — 주면 다시 읽지 않는다(id·요청자가 같을 때만) */
    caseRow?: SupportCaseRow | null;
  }
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const gate =
    input.caseRow && input.caseRow.id === input.caseId && input.caseRow.requester_user_id === input.userId
      ? ({ ok: true, case: input.caseRow } as const)
      : await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  const unread = Number(gate.case.requester_unread_count ?? 0);
  if (!Number.isFinite(unread) || unread <= 0) {
    return { ok: true, wrote: false };
  }
  // 남은 위험 ①: 0 아니면 그대로가 아니라 **실제 글 기준**으로 맞춘다 — 보여 준 목록 기준 시각 뒤에 온
  // 어드민 공개 답변(삭제 안 됨) 수 = 아직 안 본 답변 수. 알림 행(보여 준 답변만 읽음)과 같은 기준.
  const seen = input.seenLastMessageAt?.trim() || String(gate.case.last_message_at ?? "");
  const remaining = await countRepliesAfter(sb, input.caseId, "requester", seen);
  if (remaining == null || remaining === unread) return { ok: true, wrote: false };
  // CAS: 센 뒤 새 답변이 붙어 숫자가 바뀌었으면 쓰지 않는다(덜 세지 않는다 — 다음 열람 때 다시 맞춘다)
  const { error } = await sb
    .from("support_cases")
    .update({ requester_unread_count: remaining, updated_at: new Date().toISOString() })
    .eq("id", input.caseId)
    .eq("requester_unread_count", unread)
    // 4차 재감사 ①: 센 뒤 새 글이 붙었으면(마지막 글 시각이 바뀜) 쓰지 않는다 — 답변+삭제가 겹쳐 숫자가 같아진 경우도 막는다
    .eq("last_message_at", gate.case.last_message_at);
  if (error) {
    console.error("[support] requester_read_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "read_failed" };
  }
  return { ok: true, wrote: true };
}

/** 재감사 D8 — 진행 중 문의에 이어 붙은 접수에서 고객이 고른 세부(사건 `followup_issue_selected`). */
export async function listSupportFollowupIssueSelections(
  sb: SupabaseClient,
  caseId: string
): Promise<{ messageId: string; issueType: string }[]> {
  const { data, error } = await sb
    .from("support_case_events")
    .select("payload")
    .eq("case_id", caseId)
    .eq("event_type", "followup_issue_selected");
  if (error || !data) return [];
  const out: { messageId: string; issueType: string }[] = [];
  for (const row of data as { payload?: { message_id?: unknown; issue_type?: unknown } | null }[]) {
    const messageId = String(row.payload?.message_id ?? "").trim();
    const issueType = String(row.payload?.issue_type ?? "").trim();
    if (messageId && issueType) out.push({ messageId, issueType });
  }
  return out;
}

/**
 * Phase 3 A3 — bell/app-icon read sync. Opening a case marks this viewer's unread
 * `support_*` notification_events for the same case read (same write shape as the legacy
 * `markMemberAdminNoteNotificationsRead`). Separate from the case-counter mark-read above:
 * touches only notification_events (no support_cases UPDATE).
 */
export async function markSupportCaseNotificationsRead(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    /** 재감사 D15: 어드민 상세에서만 어드민 알림도 읽음 */
    includeAdmin?: boolean;
    /**
     * 3차 재감사 2: 화면에 돌려준 글 id. 주면 답변 알림(`support_admin_replied:<글 id>`)은 이 글들 것만 읽음 —
     * 목록을 읽은 뒤 도착한 답변의 알림은 남긴다(고객 미읽음 숫자와 같은 기준). 종료·재오픈 알림은 그대로 모두 읽음.
     */
    shownMessageIds?: readonly string[];
    /**
     * 남은 위험 5 (어드민): 화면에 보여 준 고객 글 id. 주면 어드민 알림은 이 글들의 고객 글 알림 + 담당 지정 알림만 읽음 —
     * 목록을 읽은 뒤 온 고객 글 알림은 남긴다(admin_unread_count 와 같은 기준).
     */
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
    // 6차 재감사 5: 요청 주소 길이 — 답변 알림 키는 100개씩
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
  // 4차 재감사 2: 두 갱신 중 하나만 실패해도 바뀐 행이 있으면 배지 캐시를 비운다
  if (count > 0) invalidateNotificationBadgeCache(uid);
  if (error) {
    console.warn("[support] notification_read_sync_failed", { caseId, error: error.message });
    return count;
  }
  if (!input.includeAdmin) return count;
  // R13: the admin's support reply notifications for this case (admin store).
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
        // 6차 재감사 4: 둘 중 하나만 실패해도 기록
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
 * Mark admin unread → 0.
 * IDEMPOTENT: when already 0, perform **no UPDATE** (same write contract as requester).
 */
export async function markSupportCaseReadForAdmin(
  sb: SupabaseClient,
  caseId: string,
  /** 2차 재감사 E: 화면에 돌려준 글 목록의 기준 시각. 그 뒤 새 고객 글이 왔으면 읽음 0 으로 만들지 않는다 */
  seenLastMessageAt?: string | null,
  /** 최종 점검 L6: 호출 측(상세 GET)이 이미 읽은 문의 행 — 주면 다시 읽지 않는다(id 가 같을 때만) */
  caseRow?: SupportCaseRow | null
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  // 최종 점검 M8: 바뀔 값이 없으면(미읽음 0 · 계산값 = 지금 값) UPDATE 를 보내지 않는다 — 실시간 UPDATE 메아리 없음
  const gate = caseRow && caseRow.id === caseId ? ({ ok: true, case: caseRow } as const) : await getSupportCaseForAdmin(sb, caseId);
  if (!gate.ok) return gate;
  const unread = Number(gate.case.admin_unread_count ?? 0);
  if (!Number.isFinite(unread) || unread <= 0) {
    return { ok: true, wrote: false };
  }
  // 남은 위험 ① (어드민 쪽): 보여 준 목록 기준 시각 뒤에 온 고객 공개 글 수로 맞춘다(CAS — 덜 세지 않는다)
  const seen = seenLastMessageAt?.trim() || String(gate.case.last_message_at ?? "");
  const remaining = await countRepliesAfter(sb, caseId, "admin", seen);
  if (remaining == null || remaining === unread) return { ok: true, wrote: false };
  const { error } = await sb
    .from("support_cases")
    .update({ admin_unread_count: remaining, updated_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("admin_unread_count", unread)
    .eq("last_message_at", gate.case.last_message_at);
  if (error) {
    console.error("[support] admin_read_failed", { caseId, error: error.message });
    return { ok: false, error: "read_failed" };
  }
  return { ok: true, wrote: true };
}

export { buildAdminSupportCaseRoute, buildSupportCaseRoute };
