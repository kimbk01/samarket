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
  authorityConfirmedLoss,
  settleSupportCustomerMessageNotification,
  createAdminNotification,
  resolveAdminRecipientAuthority,
} from "@/lib/admin/notifications/admin-notification-service";
import {
  buildSupportCustomerRepliedTitle,
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
import type { SupportContext } from "@/lib/support/support-context";
import { isSupportContextEnabled } from "@/lib/support/support-context";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { buildReopenedNotification, buildResolvedNotification } from "@/lib/support/support-requester-notification-copy";
import { buildSupportOpenedSeedBody, buildSupportTriageSeedBody } from "@/lib/support/support-seed-message-text";
import {
  buildAdminSupportCaseRoute,
  buildSupportCaseRoute,
  type SupportCaseRow,
  type SupportMessageRow,
  type SupportCaseStatus,
  type SupportCasePriority,
  type AdminSupportListFilter,
  ADMIN_SUPPORT_TABS,
  adminSupportTabFromLegacyFilter,
  type AdminSupportTab,
} from "@/lib/support/support-case-types";
import {
  applyAdminSeen,
  applyReplyDeletedForRequester,
  applyRequesterClosed,
  applyRequesterSeen,
  ensureRequesterSupportNotification,
  runAfterResponse,
  loadCustomerMessageIdsWithAdminAlert,
  markFormerAssigneeCaseAlertsRead,
  markSupportCaseNotificationsRead as ledgerMarkSupportCaseNotificationsRead,
  markSupportCaseReadForAdmin as ledgerMarkSupportCaseReadForAdmin,
  markSupportCaseReadForRequester as ledgerMarkSupportCaseReadForRequester,
  recordRequesterSupportNotification,
  resolveSupportAdminAlerts,
  reviveCustomerMessageAdminAlerts,
  syncReplyNotificationBody,
  type SupportRequesterNotificationInput,
} from "@/lib/support/support-notification-ledger";
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
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
  /** 계약 §1 — 접수 요청 id (같은 id 재전송 = 처음 결과 · 알림 없음) */
  clientRequestId?: string | null;
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
    // 재감사 2차 1: 권한 잃음이 **확인된** 때만 담당을 푼다 — 프로필 읽기 실패(판정 못 함)는 이번 글만 전원에게 보내고 담당은 그대로
    if ((notified.revokedRecipients ?? 0) > 0) {
      const released = await releaseSupportAssigneeOnActiveCases(sb, { assigneeId: assignee, caseId: c.id, trigger: "customer_reply" });
      if (released.error) console.error("[support] assignee_release_failed", { caseId: c.id, error: released.error });
    }
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
 *     (CAS: 마지막 글 = 최신 어드민 답변) ⑤ 남은 글 중 **알림이 아직 없는 글만** 알림을 만든다(B-3 — 이미 있는 글은 다시 퍼뜨리지 않는다).
 * - delete (어드민이 공개 답변을 지운 뒤): 문의가 WAITING_USER 이고, 남은 답변 기준으로 답을 못 받은 고객 글이 생겼으면
 *     WAITING_ADMIN 으로 되돌린다(CAS) → 그 글 알림이 이미 읽혔으면 되살리고, 없으면 만든다(같은 dedupe 키).
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
  // 병합 전 2차 4 · 남은 위험 2: 이미 「답변 필요」(WAITING_ADMIN · 재오픈 OPEN)여도 지운 답변이 유일한 답이던 글의 알림은 되살린다(상태는 그대로)
  if (input.mode === "delete" && c.status !== "WAITING_USER" && c.status !== "WAITING_ADMIN" && c.status !== "OPEN") return 0;
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
  if (input.mode === "delete") {
    if (unanswered.length === 0) return 0;
    if (c.status === "WAITING_ADMIN" || c.status === "OPEN") {
      // 지운 답변이 본 글(답변 시각·본 시각 이하)만 — 원래부터 답을 기다리던 글의 알림(어드민이 읽었을 수 있음)은 건드리지 않는다
      const del = input.deletedReply;
      if (!del) return 0;
      // B-3: 본 시각 기록은 위 답 판정에서 이미 읽었다 — 다시 읽지 않는다
      const seenMap = answers.seenAtByReply;
      const newly = unanswered.filter((m) =>
        Date.parse(m.created_at) <= Date.parse(del.created_at) && supportReplySawMessage(del, seenMap, m.created_at)
      );
      if (newly.length === 0) return 0;
      scheduleAdminAlertsForUnanswered(sb, c, newly.map((m) => m.id), answers, true);
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
    scheduleAdminAlertsForUnanswered(sb, c, unanswered.map((m) => m.id), answers, true);
    return unanswered.length;
  }
  const latestReplyAt = answers.latestReplyAt;
  // 요청 예산(5차 재감사 실측): 답 받은 고객 글·담당 지정 알림 읽음은 어드민 쪽 일 — 응답 뒤(같은 조건이라 다시 해도 같다).
  //   어드민 헤더 숫자는 그 읽음의 실시간 UPDATE 로 바로 맞는다.
  const doneKeys = done.map((m) => `support_customer_replied:${m.id}`);
  runAfterResponse(async () => {
    try {
      await Promise.all([
        resolveSupportAdminAlerts(sb, { caseId: c.id, kinds: ["support_customer_replied"], dedupeKeys: doneKeys }),
        resolveSupportAdminAlerts(sb, { caseId: c.id, kinds: ["support_case_assigned"] }),
      ]);
    } catch (err) {
      console.error("[support] answered_admin_alerts_resolve_failed", { caseId: c.id, err });
    }
  });
  // 상태 맞춤 — CAS: 마지막 글 = 최신 어드민 답변(그 뒤 고객 글이 오면 DB 함수가 WAITING_ADMIN 으로 이미 맞춤 · 건드리지 않음)
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
  scheduleAdminAlertsForUnanswered(sb, c, unanswered.map((m) => m.id), answers, false);
  return unanswered.length;
}

/**
 * 남은 고객 글의 알림을 (없으면) 만든다 — B-3: 이미 어드민 알림 행(또는 대기 중 발송)이 있는 글은 건너뛴다(같은 행을 다시 읽거나
 * 받는 사람 권한을 다시 묻지 않는다). 본문·첫 글 판정은 한 번씩만 읽는다. 발송은 응답 뒤(같은 판정 · 같은 dedupe 키).
 */
/**
 * 요청 예산(2026-11-29 실측): 답 못 받은 고객 글의 어드민 알림 되살림·만들기는 어드민 쪽 일이라 **응답 뒤**에 한다
 * (상태 되돌림·숫자는 응답 전 — 화면이 바로 맞는 값을 본다). 같은 dedupe 키·「이미 알림 있는 글 건너뜀」이라 다시 해도 같다.
 */
function scheduleAdminAlertsForUnanswered(
  sb: SupabaseClient,
  c: SupportCaseRow,
  messageIds: string[],
  answers: Parameters<typeof notifyUnansweredCustomerMessages>[3],
  revive: boolean
): void {
  runAfterResponse(async () => {
    try {
      // 5차 재감사(경합): 응답 뒤 그사이 새 답변이 그 글을 봤으면 되살리지·만들지 않는다 — 지금 답 판정으로 다시 거른다
      const now = await loadSupportCustomerMessageAnswers(sb, {
        caseId: c.id,
        onlyBeforeLatestReply: false,
        fallbackLatestReplyAt: null,
        limit: SUPPORT_MESSAGES_LIST_LIMIT,
      });
      // 그사이 종료·보관됐으면 어드민 일이 없다
      const { data: st } = await sb.from("support_cases").select("status").eq("id", c.id).maybeSingle();
      const status = String((st as { status?: unknown } | null)?.status ?? "");
      if (status !== "OPEN" && status !== "WAITING_ADMIN" && status !== "WAITING_USER") return;
      const stillOpen = now ? new Set(now.customers.filter((m) => !m.answered).map((m) => m.id)) : null;
      const ids = stillOpen ? messageIds.filter((id) => stillOpen.has(id)) : messageIds;
      if (ids.length === 0) return;
      if (revive) await reviveCustomerMessageAdminAlerts(sb, c.id, ids);
      await notifyUnansweredCustomerMessages(sb, c, ids, now ?? answers);
    } catch (err) {
      console.error("[support] unanswered_admin_alerts_failed", { caseId: c.id, err });
    }
  });
}

async function notifyUnansweredCustomerMessages(
  sb: SupabaseClient,
  c: SupportCaseRow,
  messageIds: readonly string[],
  answers?: { customers: readonly { id: string; created_at: string }[] } | null
): Promise<void> {
  if (messageIds.length === 0) return;
  const existing = await loadCustomerMessageIdsWithAdminAlert(sb, c.id, messageIds);
  const pending = existing ? messageIds.filter((id) => !existing.has(id)) : [...messageIds];
  if (pending.length === 0) return;
  const bodies = await sb
    .from("support_messages")
    .select("id, body, sender_user_id")
    .eq("case_id", c.id)
    .in("id", pending);
  if (bodies.error) {
    console.error("[support] reply_unseen_body_read_failed", { caseId: c.id, error: bodies.error.message });
    return;
  }
  // 병합 전 2차 5: 그 문의의 첫 고객 공개 글이면 제목 「새 고객 문의」 — 답 판정 목록(최신 먼저)이 전체면 그 마지막, 아니면 1번 읽기
  let firstId = "";
  const list = answers?.customers ?? [];
  // (답 판정 목록은 최신 먼저 · 답변 정리 모드는 최신 답변 앞 글만이지만 가장 오래된 글은 그 안에 있다)
  if (list.length > 0 && list.length < SUPPORT_MESSAGES_LIST_LIMIT) firstId = String(list[list.length - 1]?.id ?? "");
  if (!firstId) {
    const first = await sb
      .from("support_messages")
      .select("id")
      .eq("case_id", c.id)
      .eq("message_type", "PUBLIC")
      .in("sender_type", ["MEMBER", "OWNER"])
      .order("created_at", { ascending: true })
      .limit(1);
    firstId = first.error ? "" : String(((first.data ?? [])[0] as { id?: unknown } | undefined)?.id ?? "");
  }
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

/** 글 본문 상한 — 새 글·어드민 답변 수정·진행 중 문의에 붙는 접수 글 공통 (최종 점검 L8 · S-5) */
export const SUPPORT_MESSAGE_BODY_MAX = 8000;

/** 고객 글 목록 상한 (최종 감사 L11) — 한 문의 글이 이보다 많으면 **최신** 이만큼(재감사 L11-a) */
const SUPPORT_MESSAGES_LIST_LIMIT = 1000;

/**
 * 고객 알림 — 원장(`recordRequesterSupportNotification`): 알림함 행은 응답 전 저장(실패 1회 재시도), 푸시는 응답 뒤.
 * 실패는 기록만(상태·글은 이미 저장됨).
 */
async function notifyRequester(
  sb: SupabaseClient,
  requesterUserId: string,
  build: (lang: Parameters<typeof notifySafeT>[0]) => SupportRequesterNotificationInput,
  replyMessageId?: string | null
): Promise<void> {
  try {
    await recordRequesterSupportNotification(sb, (lang) => build(lang), { requesterUserId, replyMessageId: replyMessageId ?? null });
  } catch (err) {
    console.error("[support] notification_failed", { userId: requesterUserId, err });
  }
}

/**
 * 재감사 D6: 어드민 알림(권한 확인·저장·푸시)은 고객 응답을 기다리게 하지 않는다 — 응답 뒤 끝까지 보장(`after`).
 * 요청 밖(크론·시험)에서는 그냥 진행된다. 실패는 알림 함수 안에서 기록하고, 남은 글은 DB 재생 함수가 다시 만든다.
 */
function notifyAdminsAfterResponse(
  sb: SupabaseClient,
  input: Parameters<typeof notifyAdminsOfCustomerMessage>[1]
): void {
  // 요청 예산·지연: 응답을 보낸 **뒤에 시작**한다(전에는 응답 전에 시작해 같은 요청 안에서 돌았다 — 받는 어드민 수에 비례).
  runAfterResponse(() =>
    notifyAdminsOfCustomerMessage(sb, input).catch((err: unknown) => {
      console.error("[support] admin_notification_failed", { caseId: input.caseRow.id, err });
    })
  );
}

/** 요청 id (계약 §1) — uuid 문자열. 없음 = null(옛 클라이언트 · 지금처럼). 형식이 틀리면 "invalid". */
export function parseSupportRequestId(raw: unknown): string | null | "invalid" {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return "invalid";
  const v = raw.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : "invalid";
}

/**
 * 계약 §1 — 같은 요청 id 로 이미 저장된 글(속도 제한보다 먼저 본다). 보낸 사람·문의가 다르면 `conflict`.
 * found=false = 처음 요청. 읽기 실패 = error(호출 측은 그대로 진행 — DB 함수가 다시 확인한다).
 */
export async function findSupportMessageReplay(
  sb: SupabaseClient,
  input: { requestId: string; caseId?: string | null; senderUserId?: string | null; senderAdminId?: string | null }
): Promise<{ found: false } | { found: true; message: SupportMessageRow } | { conflict: true } | { error: string }> {
  const { data, error } = await sb.from("support_messages").select("*").eq("client_request_id", input.requestId).maybeSingle();
  if (error) return { error: "replay_read_failed" };
  if (!data) return { found: false };
  const m = data as SupportMessageRow;
  const sameSender = input.senderAdminId
    ? m.sender_admin_id === input.senderAdminId
    : Boolean(input.senderUserId) && m.sender_user_id === input.senderUserId && m.sender_type !== "ADMIN";
  if (!sameSender || (input.caseId && m.case_id !== input.caseId)) return { conflict: true };
  return { found: true, message: m };
}

/** 접수 replay 응답 = 처음과 같은 문의·created (계약 §1). 문의를 못 보면(소유 잃음 등) null. */
export async function loadSupportOpenReplay(
  sb: SupabaseClient,
  input: { userId: string; message: SupportMessageRow }
): Promise<{ case: SupportCaseRow; sessionId: string | null; created: boolean } | null> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.message.case_id });
  if (!gate.ok) return null;
  const [earlier, session] = await Promise.all([
    sb
      .from("support_messages")
      .select("id")
      .eq("case_id", input.message.case_id)
      .lt("created_at", input.message.created_at)
      .limit(1),
    sb.from("support_sessions").select("id").eq("case_id", input.message.case_id).is("closed_at", null).maybeSingle(),
  ]);
  if (earlier.error) return null;
  return {
    case: gate.case,
    sessionId: session.data ? String((session.data as { id?: unknown }).id ?? "") || null : null,
    created: (earlier.data ?? []).length === 0,
  };
}

export async function openSupportCaseFromContext(
  sb: SupabaseClient,
  input: OpenSupportCaseInput
): Promise<
  | { ok: true; case: SupportCaseRow; sessionId: string; created: boolean; replayed?: boolean }
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

  // 문의 행 요약 칸(initial_summary)은 2000자 — 진행 중 문의에 붙는 글은 원문 그대로 8000자(S-5)
  const rawSummary = typeof input.initialSummary === "string" ? input.initialSummary.trim() : "";
  const initialSummary = rawSummary.slice(0, 2000) || null;
  const guidanceKey = input.guidanceKey?.trim() || null;
  const guidanceRevision =
    input.guidanceRevision == null ? null : Number(input.guidanceRevision);
  const guidanceOutcome = input.guidanceOutcome?.trim() || null;

  const initialBody = (input.initialBody ?? "").trim();
  const hasStructuredSummary = Boolean(rawSummary);
  // SSOT §4 (F2): 새 문의 = 어드민 미읽음 1. 첫 글이 시드(접수형 쓰기 화면은 항상 시드)면 DB 함수가 숫자를 올리지 않으므로 1로 넣는다.
  const firstIsSeed = hasStructuredSummary || !initialBody;
  const firstBody = hasStructuredSummary
    ? initialBody || buildDefaultTriageSeed(cat.category, cat.issueType)
    : initialBody || buildSupportOpenedSeedBody();
  const followupBody = (rawSummary || initialBody).slice(0, SUPPORT_MESSAGE_BODY_MAX);
  const referenceType = norm.referenceType && norm.referenceId ? norm.referenceType : null;
  const referenceId = norm.referenceType && norm.referenceId ? norm.referenceId : null;

  // 계약 §2 (S-1·S-4·S-5): 잠금 → 요청 id replay → 진행 중 문의(있으면 붙이기) / 새 문의·세션·첫 글·사건 = 한 트랜잭션
  const { data, error } = await sb.rpc("support_open_case", {
    p_requester_user_id: input.userId,
    p_audience: norm.audience,
    p_owner_store_id: norm.audience === "OWNER" ? norm.ownerStoreId : null,
    p_category: cat.category,
    p_issue_type: cat.issueType,
    p_subject: defaultSubject(cat.category, norm.sourceSurface),
    p_source_surface: norm.sourceSurface,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
    p_initial_summary: initialSummary,
    p_guidance_key: guidanceKey,
    p_guidance_revision: Number.isFinite(guidanceRevision as number) ? guidanceRevision : null,
    p_guidance_outcome: guidanceOutcome,
    p_first_body: firstBody.slice(0, SUPPORT_MESSAGE_BODY_MAX),
    p_first_is_seed: firstIsSeed,
    p_followup_body: followupBody,
    p_event_payload: {
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
    p_client_request_id: input.clientRequestId ?? null,
  });
  if (error || !data) {
    const msg = error?.message ?? "";
    if (isMissingSupportTable(msg)) return { ok: false, error: "missing_table" };
    if (/support_request_id_conflict/.test(msg)) return { ok: false, error: "request_id_conflict" };
    if ((error as { code?: string } | null)?.code === "23505") return { ok: false, error: "active_case_exists" };
    // 최종 감사 L4: DB 오류 원문은 응답에 싣지 않는다 — 기록만, 응답은 고정 키
    console.error("[support] open_case_failed", { error: msg || null });
    return { ok: false, error: "case_open_failed" };
  }
  const res = data as {
    case: SupportCaseRow;
    created: boolean;
    replayed: boolean;
    message: (SupportMessageRow & { replayed?: boolean }) | null;
    session_id: string | null;
  };
  const caseRow = res.case;
  // 처음 요청일 때만 어드민 알림 (replay = 알림·푸시 없음 · 계약 §1). 붙일 글이 없던 접수(빈 내용)는 알림 없음.
  if (!res.replayed && res.message && !res.message.replayed) {
    notifyAdminsAfterResponse(sb, {
      caseRow,
      messageId: String(res.message.id),
      body: String(res.message.body ?? ""),
      actorUserId: input.userId,
      isNewCase: res.created === true,
    });
  }
  return {
    ok: true,
    case: caseRow,
    sessionId: String(res.session_id ?? ""),
    created: res.created === true,
    ...(res.replayed ? { replayed: true } : {}),
  };
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
  // A-6: 사장님 문의는 지금도 그 매장 사장님일 때만(상세와 같은 소유 확인) — 소유를 잃은 매장 문의는 목록에 없다
  const page = paged
    ? sliceMypageKeysetPage(
        rows,
        limit,
        (r) => String(r.last_message_at ?? ""),
        (r) => String(r.id ?? "")
      )
    : { items: rows, next_cursor: null };
  const owned = await filterRequesterOwnedCases(sb, input.userId, page.items);
  return { ok: true, cases: owned, nextCursor: page.next_cursor };
}

/**
 * A-6 (2026-11-29) — 고객 목록·숫자·개수도 상세(`getSupportCaseForUser`)와 같은 소유 확인: 사장님(OWNER) 문의는 지금 그 매장
 * 사장님일 때만 보인다. 매장 소유 확인은 사용자+매장 5초 캐시(`getCachedStoreIfOwner`) — 매장마다 1번.
 */
async function filterRequesterOwnedCases<T extends { audience?: unknown; owner_store_id?: unknown }>(
  sb: SupabaseClient,
  userId: string,
  rows: readonly T[]
): Promise<T[]> {
  const storeIds = [
    ...new Set(
      rows.filter((r) => r.audience === "OWNER" && r.owner_store_id).map((r) => String(r.owner_store_id))
    ),
  ];
  if (storeIds.length === 0) return [...rows];
  const owned = new Set<string>();
  await Promise.all(
    storeIds.map(async (sid) => {
      const gate = await getCachedStoreIfOwner(sb, userId, sid).catch(() => ({ ok: false }) as const);
      if (gate.ok) owned.add(sid);
    })
  );
  return rows.filter((r) => r.audience !== "OWNER" || (r.owner_store_id != null && owned.has(String(r.owner_store_id))));
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
    .select("requester_unread_count, audience, owner_store_id")
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
  // A-6: 소유를 잃은 매장 문의의 숫자는 넣지 않는다(상세를 못 열어 지울 수 없는 숫자가 남지 않게)
  const owned = await filterRequesterOwnedCases(
    sb,
    input.userId,
    (data ?? []) as { requester_unread_count?: unknown; audience?: unknown; owner_store_id?: unknown }[]
  );
  const unread = owned.reduce(
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
  // S-12: 지운 글은 고치지 않는다(수정·삭제가 겹치면 삭제가 이긴다 — 지운 답변의 새 문장이 알림함에 남지 않게)
  const { data, error } = await sb
    .from("support_messages")
    .update({ body, edited_at: now })
    .eq("id", input.messageId)
    .eq("case_id", input.caseId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[support] message_edit_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "edit_failed" };
  }
  if (!data) return { ok: false, error: "message_deleted" };
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "message_edited",
    actorUserId: input.adminUserId,
    payload: { message_id: input.messageId, previous_body: previousBody },
  });
  // 고객 알림함 미리보기를 수정본으로 (B-4: 받는 사람 + 키)
  if (own.message.message_type === "PUBLIC") {
    const c = await getSupportCaseForAdmin(sb, input.caseId);
    if (c.ok) await syncReplyNotificationBody(sb, { requesterUserId: c.case.requester_user_id, messageId: input.messageId, body });
    // 수정 뒤에도 지워지지 않았는지 다시 본다 — 그사이 삭제됐으면 삭제 문구로 되돌린다(S-12)
    const { data: after } = await sb.from("support_messages").select("deleted_at").eq("id", input.messageId).maybeSingle();
    if ((after as { deleted_at?: unknown } | null)?.deleted_at && c.ok) {
      await syncReplyNotificationBody(sb, {
        requesterUserId: c.case.requester_user_id,
        messageId: input.messageId,
        body: "support_message_deleted",
      });
    }
  }
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
  // S-14: 아직 안 지운 글만 — 연타·동시 삭제는 한 번만 지우고(사건·감사 1건) 두 번째는 message_deleted
  const { data: deleted, error } = await sb
    .from("support_messages")
    .update({ deleted_at: now })
    .eq("id", input.messageId)
    .eq("case_id", input.caseId)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("[support] message_delete_failed", { caseId: input.caseId, error: error.message });
    return { ok: false, error: "delete_failed" };
  }
  if (!deleted || (deleted as unknown[]).length === 0) return { ok: false, error: "message_deleted" };
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "message_deleted",
    actorUserId: input.adminUserId,
    payload: { message_id: input.messageId },
  });
  // B-3: 문의 행은 한 번만 읽는다(고객 숫자 정리와 답변 정리가 같은 행을 쓴다)
  const latest = await getSupportCaseForAdmin(sb, input.caseId);
  if (!latest.ok) return { ok: true };
  // 고객 쪽(원장): 알림 본문 = 삭제 키 · 안 읽힌 답변이었으면 미읽음 −1 (알림 행 UPDATE = 고객 신호)
  await applyReplyDeletedForRequester(sb, {
    caseRow: latest.case,
    messageId: input.messageId,
    isPublic: own.message.message_type === "PUBLIC",
    now,
  });
  // 최종 점검 M5: 지운 공개 답변이 고객 글의 유일한 답이었으면 문의를 「답변 필요」로 되돌리고 그 글 알림을 다시 살린다
  if (own.message.message_type === "PUBLIC") {
    await reconcileSupportAdminWork(sb, {
      caseRow: latest.case,
      mode: "delete",
      deletedReply: { id: own.message.id, created_at: own.message.created_at },
    });
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
    /** 계약 §1 — 요청 id (같은 id 의 글이 있으면 새로 쓰지 않고 그 글 + replayed) */
    clientRequestId?: string | null;
  }
): Promise<{ ok: true; message: SupportMessageRow; replayed: boolean } | { ok: false; error: string }> {
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
  // DB transaction (support_append_message). Transition rules are unchanged.
  const { data, error } = await sb.rpc("support_append_message", {
    p_case_id: input.caseId,
    p_sender_type: senderType, // derived server-side above, never from the request body
    p_sender_user_id: input.senderUserId ?? null,
    p_sender_admin_id: input.senderAdminId ?? null,
    p_message_type: input.messageType,
    p_body: body,
    p_system_seed: input.systemSeed === true,
    p_client_request_id: input.clientRequestId ?? null,
  });

  if (error || !data) {
    // 재감사 D4: DB 함수가 잠금 안에서 종료 문의 공개 글을 거부 → 화면이 아는 오류 코드로
    if (/support_case_closed/.test(error?.message ?? "")) return { ok: false, error: "case_closed" };
    if (/support_request_id_conflict/.test(error?.message ?? "") || (error as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "request_id_conflict" };
    }
    console.error("[support] append_message_failed", {
      caseId: input.caseId,
      senderType,
      error: error?.message ?? "insert_failed",
    });
    return { ok: false, error: "message_save_failed" };
  }
  const { replayed, ...message } = data as SupportMessageRow & { replayed?: boolean };
  return { ok: true, message: message as SupportMessageRow, replayed: replayed === true };
}

export async function postRequesterSupportMessage(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    body: string;
    /** 최종 점검 L6: 호출 측이 이미 본인·매장 확인으로 읽은 문의 행 — 주면 다시 읽지 않는다(id·요청자가 같을 때만) */
    caseRow?: SupportCaseRow | null;
    clientRequestId?: string | null;
  }
): Promise<{ ok: true; message: SupportMessageRow; replayed: boolean } | { ok: false; error: string }> {
  const gate =
    input.caseRow && input.caseRow.id === input.caseId && input.caseRow.requester_user_id === input.userId
      ? ({ ok: true, case: input.caseRow } as const)
      : await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  const res = await appendSupportMessage(sb, {
    caseId: input.caseId,
    senderUserId: input.userId,
    audience: gate.case.audience,
    body: input.body,
    messageType: "PUBLIC",
    clientRequestId: input.clientRequestId ?? null,
  });
  if (!res.ok) return res;
  // replay = 처음 결과만 (어드민 알림·푸시 없음 · 계약 §1). 종료 확인은 DB 함수가 잠금 안에서(replay 먼저).
  if (res.replayed) return res;

  // SSOT §3-2 (F1): assigned admin, or every support admin when unassigned. (재감사 D6: 응답 뒤)
  notifyAdminsAfterResponse(sb, {
    caseRow: gate.case,
    messageId: res.message.id,
    body: res.message.body,
    actorUserId: input.userId,
    isNewCase: false,
  });

  return res;
}


export type AdminSupportListQuery = {
  /** 옛 단일 필터(깊은 링크) — `tab` 이 없을 때만 `adminSupportTabFromLegacyFilter` 로 탭+보조 필터로 바꾼다(D-2). */
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
  // D-2 (2026-11-29): 목록 기준은 탭 하나 — 옛 `filter` 깊은 링크는 화면과 같은 변환(`adminSupportTabFromLegacyFilter`)으로 탭+보조 필터
  const legacy = input.tab ? null : input.filter && input.filter !== "ALL" ? adminSupportTabFromLegacyFilter(input.filter) : null;
  const tab: AdminSupportTab = input.tab ?? legacy?.tab ?? "ALL";
  const audienceFilter = input.audience ?? legacy?.audience ?? null;
  const assigneeFilter = input.assignee ?? legacy?.assignee ?? null;
  const actionableOldestFirst = tab === "ACTIONABLE";
  let query = sb
    .from("support_cases")
    .select("*", { count: "exact" })
    .order("last_message_at", { ascending: actionableOldestFirst })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  // 탭 상태 = 처리 대기 레지스트리·통합 대시보드 「고객지원 미처리」와 같은 필터 함수
  query = applySupportCaseTabFilter(query, tab);

  if (audienceFilter === "MEMBER" || audienceFilter === "OWNER") {
    query = query.eq("audience", audienceFilter);
  }
  // `?group=trade|community` 는 도메인 범위(scope)다 — 같은 값을 카테고리 그룹(category = TRADE 만)으로 겹쳐 걸면
  // 범위에 속한 다른 카테고리 문의(예: AD 카테고리의 거래 홍보 주문 문의)가 빠진다. 범위가 있으면 범위만 쓴다.
  const group = input.scope ? null : getSupportCategoryGroup(input.group);
  if (group) query = query.in("category", [...group.categories]);
  if (assigneeFilter === "UNASSIGNED") {
    query = query.is("assigned_admin_id", null);
  } else if (assigneeFilter === "ME" && input.adminUserId) {
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
    /** 계약 §1 — 답변·메모 요청 id */
    clientRequestId?: string | null;
  }
): Promise<
  | { ok: true; message: SupportMessageRow; unseenCustomerMessages: number; replayed: boolean }
  | { ok: false; error: string }
> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;

  const res = await appendSupportMessage(sb, {
    caseId: input.caseId,
    senderAdminId: input.adminUserId,
    body: input.body,
    messageType: input.internalNote ? "INTERNAL_NOTE" : "PUBLIC",
    clientRequestId: input.clientRequestId ?? null,
  });
  // DEF-02: 종료 문의엔 공개 답변 불가 — DB 함수가 잠금 안에서 거부(case_closed · replay 는 먼저 처음 결과)
  if (!res.ok) return res;
  // 같은 요청 id 재전송 = 처음 결과만(미읽음 증가·감사 없음 · 응답은 바로).
  // 재감사 2차 2·3차 D4·D5: 첫 요청이 저장 뒤 「답변 정리」·고객 알림 전에 끊겼을 수 있다 → 공개 답변이면 **응답 뒤에**
  //   ① 그 답변의 본 시각 기록이 없으면 정리를 다시(기록 + 상태·알림 맞춤 — CAS·같은 키라 다시 해도 같음) ② 고객 알림을 같은 키로 보장.
  //   응답 전 호출·푸시 없음(요청 예산 · 응답이 푸시를 기다리지 않음).
  if (res.replayed) {
    const m = res.message;
    if (m.message_type === "PUBLIC" && m.sender_type === "ADMIN" && !m.deleted_at) {
      const c = gate.case;
      const seenForReplay = typeof input.seenLastMessageAt === "string" ? input.seenLastMessageAt.trim() : "";
      runAfterResponse(async () => {
        try {
          const { data: seenEv } = await sb
            .from("support_case_events")
            .select("id")
            .eq("case_id", c.id)
            .eq("event_type", "admin_reply_seen")
            .eq("payload->>reply_message_id", m.id)
            .limit(1)
            .maybeSingle();
          if (!seenEv) {
            await settleAdminWorkAfterSeenReply(sb, {
              caseRow: c,
              seenLastMessageAt: seenForReplay || null,
              reply: { id: m.id, created_at: m.created_at },
            });
          }
          await ensureRequesterSupportNotification(
            sb,
            (replyLang) => ({
              userId: c.requester_user_id,
              type: "support_admin_replied",
              title: notifySafeT(replyLang, "notify_support_admin_replied_title"),
              body: m.body,
              copy: { titleKey: "notify_support_admin_replied_title" },
              caseId: c.id,
              publicCaseNo: c.public_case_no,
              audience: c.audience,
              storeId: c.owner_store_id,
              dedupeKey: `support_admin_replied:${m.id}`,
              actorUserId: input.adminUserId,
            }),
            { requesterUserId: c.requester_user_id, dedupeKey: `support_admin_replied:${m.id}`, replyMessageId: m.id }
          );
        } catch (err) {
          console.error("[support] replay_followup_failed", { caseId: c.id, err });
        }
      });
    }
    return { ok: true, message: m, unseenCustomerMessages: 0, replayed: true };
  }

  let unseenCustomerMessages = 0;
  if (!input.internalNote) {
    const seen = typeof input.seenLastMessageAt === "string" ? input.seenLastMessageAt.trim() : "";
    // 최종 감사 D1 (3차 재감사): 모든 공개 답변이 「본 시각」을 남기고, 본 글까지만 끝난 일로 한다.
    unseenCustomerMessages = await settleAdminWorkAfterSeenReply(sb, {
      caseRow: gate.case,
      seenLastMessageAt: seen || null,
      reply: { id: res.message.id, created_at: res.message.created_at },
    });
    // 계약 §4 · S-6: DB 함수가 고객 미읽음 +1 → 같은 요청에서 고객 알림 행 저장(응답 전) · 푸시는 응답 뒤
    const c = gate.case;
    const replyBody = res.message.body;
    const messageId = res.message.id;
    await notifyRequester(
      sb,
      c.requester_user_id,
      (replyLang) => ({
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
      }),
      messageId
    );
  }

  // SSOT §8 F10: no "reply + close" in one call — closing is its own action.
  return { ok: true, message: res.message, unseenCustomerMessages, replayed: false };
}

type SupportTransitionAction =
  | "admin_resolve"
  | "requester_close"
  | "auto_close"
  | "archive"
  | "unarchive"
  | "reopen"
  | "assign"
  | "priority";

type SupportTransitionResult =
  | { ok: true; changed: boolean; case: SupportCaseRow; previousStatus: string | null; previousAssignee: string | null }
  | { ok: false; error: string; case?: SupportCaseRow };

/**
 * 계약 §2 — 상태 전이 표 하나(DB 함수 `support_transition_case`): 상태·미읽음·세션·사건·어드민 알림 읽음을 같은 트랜잭션.
 * 이미 목표 상태면 changed=false 로 ok(멱등 · S-15·S-16·S-17).
 */
async function transitionSupportCase(
  sb: SupabaseClient,
  input: {
    caseId: string;
    action: SupportTransitionAction;
    actorUserId?: string | null;
    seenLastMessageAt?: string | null;
    expectedAssignee?: string | null;
    assignee?: string | null;
    priority?: string | null;
  }
): Promise<SupportTransitionResult> {
  const { data, error } = await sb.rpc("support_transition_case", {
    p_case_id: input.caseId,
    p_action: input.action,
    p_actor_user_id: input.actorUserId ?? null,
    p_seen_last_message_at: input.seenLastMessageAt ?? null,
    p_expected_assignee: input.expectedAssignee ?? null,
    p_assignee: input.assignee ?? null,
    p_priority: input.priority ?? null,
  });
  if (error || !data) {
    console.error("[support] transition_failed", { caseId: input.caseId, action: input.action, error: error?.message ?? null });
    return { ok: false, error: "transition_failed" };
  }
  const r = data as {
    ok?: boolean;
    error?: string | null;
    changed?: boolean;
    case?: SupportCaseRow | null;
    previous_status?: string | null;
    previous_assignee?: string | null;
  };
  if (!r.ok) return { ok: false, error: String(r.error ?? "transition_failed"), ...(r.case ? { case: r.case } : {}) };
  if (!r.case) return { ok: false, error: "transition_failed" };
  return {
    ok: true,
    changed: r.changed === true,
    case: r.case,
    previousStatus: r.previous_status ?? null,
    previousAssignee: r.previous_assignee ?? null,
  };
}

function parseSeenOrNull(raw: string | null | undefined): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  return v && Number.isFinite(Date.parse(v)) ? v : null;
}

/**
 * 어드민 상태 변경 — `mode`: close(진행 중 → RESOLVED · 본 시각 CAS) · archive(RESOLVED → ARCHIVED) · unarchive(ARCHIVED → RESOLVED).
 * `mode` 가 없으면(옛 호출) `status` 로 고른다: ARCHIVED = archive · RESOLVED = 보관 문의면 unarchive, 아니면 close.
 * 진행 중으로 되돌리기는 재오픈만(SSOT §8 F15).
 */
export async function adminUpdateSupportCaseStatus(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    caseId: string;
    status: SupportCaseStatus;
    mode?: "close" | "archive" | "unarchive";
    seenLastMessageAt?: string | null;
  }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  if (!isUuid(input.caseId)) return { ok: false, error: "invalid_case_id" };
  let mode = input.mode;
  if (!mode) {
    if (input.status === "ARCHIVED") mode = "archive";
    else if (input.status === "RESOLVED") {
      const gate = await getSupportCaseForAdmin(sb, input.caseId);
      if (!gate.ok) return gate;
      mode = gate.case.status === "ARCHIVED" ? "unarchive" : "close";
    } else return { ok: false, error: "invalid_transition" };
  }
  if (mode === "close" && input.status !== "RESOLVED") return { ok: false, error: "invalid_transition" };
  const r = await transitionSupportCase(sb, {
    caseId: input.caseId,
    action: mode === "close" ? "admin_resolve" : mode,
    actorUserId: input.adminUserId,
    seenLastMessageAt: mode === "close" ? parseSeenOrNull(input.seenLastMessageAt) : null,
  });
  if (!r.ok) return { ok: false, error: r.error };
  if (mode === "close") {
    const c = r.case;
    const build = (resolvedLang: Parameters<typeof notifySafeT>[0]) => buildResolvedNotification(c, input.adminUserId, resolvedLang);
    // 고객 「종료」 알림 — 바뀐 때만(이미 종료 = 다시 보내지 않음 · 고객 「확인했어요」·보관 해제와 사건 모양이 같아 재요청으로 판정할 수 없다).
    // 알림함 행은 응답 전 저장(원장) · 푸시는 응답 뒤.
    if (r.changed) await notifyRequester(sb, c.requester_user_id, build);
  }
  return { ok: true, case: r.case };
}

export async function adminAssignSupportCase(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; assigneeAdminId: string | null }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  // 최종 감사 L1: 종료·보관 문의는 담당을 바꾸지 않는다 — 재오픈 뒤에 지정
  if (gate.case.status === "RESOLVED" || gate.case.status === "ARCHIVED") {
    return { ok: false, error: "case_closed" };
  }
  const target = input.assigneeAdminId?.trim() || null;
  // 재감사 D11: 이미 그 사람이 담당이면 아무것도 바꾸지 않는다(두 번 눌러도 알림 1건)
  if ((gate.case.assigned_admin_id ?? null) === target) return { ok: true, case: gate.case };

  // R13: only an ACTIVE admin can be the assignee (assignee receives admin notifications). 결정 4: 프로필 못 읽음 = 정지.
  if (target) {
    const authority = await resolveAdminRecipientAuthority(sb, target).catch(() => ({ active: false }) as const);
    if (!authority.active) return { ok: false, error: "assignee_not_active_admin" };
    // 재감사 D2: 담당자 = 문의를 열 수 있는 사람(support 권한)
    if (!authorityAllows(authority, "support")) return { ok: false, error: "assignee_not_support_admin" };
  }

  // 최종 감사 L1: CAS(읽은 담당자) · 진행 중만 — DB 함수 한 트랜잭션(상태 확인·담당·사건)
  const r = await transitionSupportCase(sb, {
    caseId: input.caseId,
    action: "assign",
    actorUserId: input.adminUserId,
    expectedAssignee: gate.case.assigned_admin_id ?? null,
    assignee: target,
  });
  if (!r.ok) return { ok: false, error: r.error === "transition_failed" ? "assign_failed" : r.error };
  if (!r.changed) return { ok: true, case: r.case };
  const c = r.case;
  const previous = r.previousAssignee ?? gate.case.assigned_admin_id ?? null;

  // Phase 3 A5 / Owner decision D2 — assignment is internal; no customer notification.
  // SSOT §8 F14: an admin assigned by someone else gets one admin notification.
  if (target && target !== input.adminUserId) {
    const notified = await createAdminNotification(sb, {
      recipientAdminIds: [target],
      kind: "support_case_assigned",
      // 2차 재감사 I: 지정 알림도 support 권한이 있어야 읽기·푸시
      requiredPermission: "support",
      title: translateBy("ko", "admin_support_notify_assigned_title", { no: c.public_case_no }),
      body: translateBy("ko", "admin_support_notify_assigned_body"),
      linkUrl: buildAdminSupportCaseRoute(c.id),
      workRef: { table: "support_cases", id: c.id },
      dedupeKey: `support_case_assigned:${c.id}:${target}:${new Date().toISOString()}`,
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

  // 결정 2 (A-8·S-11): 수동 해제·재배정 — 옛 담당자의 그 문의 미읽음 알림(고객 글·지정) 읽음 +
  //   답 못 받은 고객 글 다시 알림(재배정 = 새 담당자 · 해제 = support 어드민 전원). 응답 뒤(문의 글 수 비례).
  if (previous && previous !== target) {
    await markFormerAssigneeCaseAlertsRead(sb, { adminUserId: previous, caseId: c.id });
    runAfterResponse(() =>
      (async () => {
        const { renotifyReleasedSupportCases } = await import("@/lib/support/support-released-case-renotify");
        await renotifyReleasedSupportCases(sb, [c.id], { assigneeAdminId: target });
      })().catch((e: unknown) => {
        console.error("[support] reassign_renotify_failed", { caseId: c.id, error: (e as Error)?.message ?? String(e) });
      })
    );
  }

  return { ok: true, case: c };
}

export async function adminSetSupportCasePriority(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; priority: SupportCasePriority }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  if (!isUuid(input.caseId)) return { ok: false, error: "invalid_case_id" };
  // S-15: 진행 중만 · 같은 값 = 쓰기 없음 (DB 함수 한 트랜잭션)
  const r = await transitionSupportCase(sb, {
    caseId: input.caseId,
    action: "priority",
    actorUserId: input.adminUserId,
    priority: input.priority,
  });
  if (!r.ok) return { ok: false, error: r.error === "transition_failed" ? "priority_failed" : r.error };
  return { ok: true, case: r.case };
}

/** 고객 문의 SSOT §2 (2차 재감사 J): 재오픈은 어드민만. `isAdmin` 은 옛 호출 호환용 — 값과 무관하게 어드민 판정. */
export async function reopenSupportCase(
  sb: SupabaseClient,
  input: { userId: string; caseId: string; isAdmin?: boolean }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  if (!isUuid(input.caseId)) return { ok: false, error: "invalid_case_id" };
  // S-17: 이미 진행 중 = ok(changed=false) · 상태·세션·사건 = 한 트랜잭션
  const r = await transitionSupportCase(sb, { caseId: input.caseId, action: "reopen", actorUserId: input.userId });
  if (!r.ok) return { ok: false, error: r.error === "transition_failed" ? "reopen_failed" : r.error };
  // 이미 진행 중 = 변화 없음 · 알림도 다시 보내지 않는다
  if (!r.changed) return { ok: true, case: r.case };
  let c = r.case;

  // A-7: 재오픈한 문의의 담당자가 권한을 잃은 것이 확인되면(정지·차단·탈퇴·권한 없음) 담당을 푼다.
  // 재감사 2차 1: 읽기 실패(판정 못 함)는 담당을 그대로 둔다 — 알림은 받는 사람 판정(결정 4)이 전원 대체로 처리한다.
  const assignee = c.assigned_admin_id ? String(c.assigned_admin_id) : "";
  if (assignee) {
    const authority = await resolveAdminRecipientAuthority(sb, assignee).catch(
      () => ({ active: false, unknown: true }) as const
    );
    if (authorityConfirmedLoss(authority, "support")) {
      const released = await releaseSupportAssigneeOnActiveCases(sb, {
        assigneeId: assignee,
        caseId: c.id,
        actorUserId: input.userId,
        trigger: "reopen",
      });
      if (released.error) console.error("[support] reopen_assignee_release_failed", { caseId: c.id, error: released.error });
      else if (released.caseIds.includes(c.id)) c = { ...c, assigned_admin_id: null };
    }
  }

  // Phase 3 A5 — notify only when someone else (admin) reopened it; never self-notify.
  if (input.userId !== c.requester_user_id) {
    const reopened = c;
    await notifyRequester(sb, c.requester_user_id, (lang) => buildReopenedNotification(reopened, input.userId, lang));
  }

  return { ok: true, case: c };
}

/**
 * 접수형 문의 — 고객(요청자)이 답변을 보고 「확인했어요」 = 종료 (Owner 「접수형 1단계」 2026-11-10).
 * - 요청자 본인 문의만(사장님 문의는 매장 소유 확인). 이미 종료면 그대로 성공(멱등).
 * - WAITING_USER 에서만 · 본 마지막 글 시각과 다르면 case_updated. 상태·숫자 0·세션·사건·어드민 알림 = 한 트랜잭션(DB 함수).
 * - 본인 행동이므로 알림을 보내지 않는다. 그 문의 고객 알림 행은 읽음(원장 · 계약 §4 신호).
 */
export async function requesterCloseSupportCase(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    seenLastMessageAt?: string | null;
  }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  const r = await transitionSupportCase(sb, {
    caseId: input.caseId,
    action: "requester_close",
    actorUserId: input.userId,
    seenLastMessageAt: parseSeenOrNull(input.seenLastMessageAt),
  });
  if (!r.ok) return { ok: false, error: r.error === "transition_failed" ? "close_failed" : r.error };
  if (r.changed) {
    await applyRequesterClosed(sb, {
      userId: input.userId,
      caseId: input.caseId,
      unreadBefore: Math.max(0, Number(gate.case.requester_unread_count ?? 0)),
    });
  }
  return { ok: true, case: r.case };
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
 * - CAS: 읽은 마지막 글 시각이 그대로일 때만(그사이 고객이 쓰면 건너뜀) — DB 함수 한 트랜잭션.
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
  let closed = 0;
  for (const row of (data ?? []) as { id: string; last_message_at: string }[]) {
    const r = await transitionSupportCase(sb, {
      caseId: row.id,
      action: "auto_close",
      seenLastMessageAt: row.last_message_at,
    });
    if (r.ok && r.changed) closed += 1;
  }
  return { ok: true, closed };
}

/**
 * 고객 미읽음 → 실제 글 기준 (원장 `support-notification-ledger.ts`). 문의 행을 안 주면 본인 확인으로 한 번 읽는다.
 */
export async function markSupportCaseReadForRequester(
  sb: SupabaseClient,
  input: { userId: string; caseId: string; seenLastMessageAt?: string | null; caseRow?: SupportCaseRow | null }
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const gate =
    input.caseRow && input.caseRow.id === input.caseId && input.caseRow.requester_user_id === input.userId
      ? ({ ok: true, case: input.caseRow } as const)
      : await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  return ledgerMarkSupportCaseReadForRequester(sb, {
    userId: input.userId,
    caseId: input.caseId,
    seenLastMessageAt: input.seenLastMessageAt ?? null,
    caseRow: gate.case,
  });
}

/** 어드민 미읽음 → 실제 글 기준 (원장). 문의 행을 안 주면 한 번 읽는다. */
export async function markSupportCaseReadForAdmin(
  sb: SupabaseClient,
  caseId: string,
  seenLastMessageAt?: string | null,
  caseRow?: SupportCaseRow | null
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const gate = caseRow && caseRow.id === caseId ? ({ ok: true, case: caseRow } as const) : await getSupportCaseForAdmin(sb, caseId);
  if (!gate.ok) return gate;
  return ledgerMarkSupportCaseReadForAdmin(sb, caseId, seenLastMessageAt ?? null, gate.case);
}

/** 보는 사람의 support_* 알림 읽음 (원장 그대로 · 옛 import 호환) */
export const markSupportCaseNotificationsRead = ledgerMarkSupportCaseNotificationsRead;

/**
 * 계약 §3 — 고객 `seen`: 화면에 실제로 보인 글만 읽음. 지금까지 상세 GET 안에서 하던 규칙 그대로(원장 `applyRequesterSeen`).
 */
export async function requesterSeenSupportCase(
  sb: SupabaseClient,
  input: { userId: string; caseId: string; shownMessageIds: readonly string[]; seenLastMessageAt: string | null }
): Promise<{ ok: true; notificationsRead: number } | { ok: false; error: string }> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  const r = await applyRequesterSeen(sb, {
    userId: input.userId,
    caseRow: gate.case,
    shownMessageIds: input.shownMessageIds,
    seenLastMessageAt: input.seenLastMessageAt,
  });
  if (!r.ok) return r;
  return { ok: true, notificationsRead: r.notificationsRead };
}

/** 계약 §3 — 어드민 `seen`: 그 어드민 것만 · 보여 준 고객 글까지(원장 `applyAdminSeen`). */
export async function adminSeenSupportCase(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; shownMessageIds: readonly string[]; seenLastMessageAt: string | null }
): Promise<{ ok: true; notificationsRead: number } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  const r = await applyAdminSeen(sb, {
    adminUserId: input.adminUserId,
    caseRow: gate.case,
    shownMessageIds: input.shownMessageIds,
    seenLastMessageAt: input.seenLastMessageAt,
  });
  if (!r.ok) return r;
  return { ok: true, notificationsRead: r.notificationsRead };
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

export { buildAdminSupportCaseRoute, buildSupportCaseRoute };
