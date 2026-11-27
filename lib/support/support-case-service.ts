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
  createAdminNotification,
  markAdminNotificationsRead,
  resolveAdminNotificationsForWork,
  resolveAdminRecipientAuthority,
} from "@/lib/admin/notifications/admin-notification-service";
import { keepAliveAfterResponse } from "@/lib/push/keep-alive-after-response";
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
async function notifyAdminsOfCustomerMessage(
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
  // 2차 재감사 E: 발송은 응답 뒤라 그사이 어드민이 답했거나 문의가 끝났을 수 있다 → 어드민 일이 남았을 때만 보낸다
  // (끝난 문의에 미읽음 알림이 새로 생기지 않게 — 답변·종료 때의 전원 읽음 처리보다 늦게 만들어지는 것 방지).
  const readStatus = async () => sb.from("support_cases").select("status").eq("id", c.id).maybeSingle();
  let live = await readStatus();
  if (live.error) live = await readStatus(); // 한 번 더
  if (live.error) {
    // 남은 위험 ③: 상태를 끝내 못 읽으면 보내지 않는다 — 5분 재생 함수(운영 적용, OPEN·WAITING_ADMIN 만)가
    // 어드민 일이 남은 글만 다시 만든다(끝난 문의에 미읽음 알림이 생기지 않는다).
    console.warn("[support] admin_notify_status_read_failed", { caseId: c.id, error: live.error.message });
    return;
  }
  const liveStatus = String((live.data as { status?: unknown } | null)?.status ?? "");
  // 남은 위험 ④: 어드민 일이 이미 끝났다(답변·종료) → 알림을 「읽음」으로 기록만 남긴다(푸시 없음).
  // 같은 글 id 키가 생겨 재생 함수가 나중에(같은 문의에 새 고객 글이 와서 다시 WAITING_ADMIN 이 돼도) 이 옛 글을 다시 보내지 않는다.
  const workDone = liveStatus !== "OPEN" && liveStatus !== "WAITING_ADMIN";
  const title = translateBy(
    "ko",
    input.isNewCase ? "admin_support_notify_new_title" : "admin_support_notify_followup_title",
    { no: c.public_case_no }
  );
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
    if (!liveStatus) return; // 문의가 없다
    const marker = await createAdminNotification(sb, {
      ...base,
      push: false,
      broadcastPermission: "support",
      requiredPermission: "support",
    });
    if (marker.ok) await resolveSupportAdminNotifications(sb, c.id);
    return;
  }
  const logFail = (error: string) =>
    console.error("[support] admin_notification_failed", {
      caseId: c.id,
      type: "support_customer_replied",
      error,
    });

  const assignee = c.assigned_admin_id ? String(c.assigned_admin_id) : "";
  if (assignee) {
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
    if (notified.skippedRecipients === 0) return;
    // Self-heal: the assignee lost admin authority but the revoke-time release did not run
    // (or failed). Return the case to the unassigned queue so it is not stranded,
    // then fall through to the unassigned fan-out so this message is not lost.
    const { data: released } = await sb
      .from("support_cases")
      .update({ assigned_admin_id: null, updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("assigned_admin_id", assignee)
      .select("id");
    if (released && released.length > 0) {
      await recordCaseEvent(sb, {
        caseId: c.id,
        eventType: "assignee_released_admin_revoked",
        actorUserId: null,
        payload: { previous_assignee: assignee, trigger: "customer_reply" },
      });
    }
  }

  const broadcast = await createAdminNotification(sb, {
    ...base,
    broadcastPermission: "support",
    requiredPermission: "support",
  });
  if (!broadcast.ok) logFail(broadcast.error);
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
    return { ok: false, error: existingErr.message };
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
    return { ok: false, error: createErr?.message ?? "create_failed" };
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
  if (error || !data) return { ok: false, error: error?.message ?? "session_failed" };
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
  if (error) return { ok: false, error: error.message };
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
    return { ok: false, error: error.message };
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
    return { ok: false, error: error.message };
  }
  return { ok: true, count: count ?? 0 };
}

export async function listSupportMessages(
  sb: SupabaseClient,
  input: { caseId: string; includeInternal?: boolean }
): Promise<{ ok: true; messages: SupportMessageRow[] } | { ok: false; error: string }> {
  let query = sb
    .from("support_messages")
    .select("*")
    .eq("case_id", input.caseId)
    .order("created_at", { ascending: true });
  if (!input.includeInternal) {
    query = query.eq("message_type", "PUBLIC");
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: error.message };
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
 * Bumps the case `updated_at` so open customer sheets (support_cases UPDATE subscription)
 * reload and show the edited / deleted state.
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
  if (error) return { ok: false, error: error.message };
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
  const body = input.body.trim();
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
  if (error || !data) return { ok: false, error: error?.message ?? "edit_failed" };
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
  if (error) return { ok: false, error: error.message };
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
  const body = input.body.trim().slice(0, 8000);
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
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  return { ok: true, message: message as SupportMessageRow };
}

export async function postRequesterSupportMessage(
  sb: SupabaseClient,
  input: { userId: string; caseId: string; body: string }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
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
    return { ok: false, error: error.message };
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
  if (error) return { ok: false, error: error.message };
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
  }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
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

  if (!input.internalNote) {
    // 4절 문구 (docs/audit/notification-defect-fix-design-2026-10-28.md): 제목에 내부 문의번호를 넣지 않는다.
    const replyLang = await loadNotificationUserLanguage(sb, gate.case.requester_user_id);
    await notifySupportEvent(sb, {
      userId: gate.case.requester_user_id,
      type: "support_admin_replied",
      title: notifySafeT(replyLang, "notify_support_admin_replied_title"),
      body: input.body,
      copy: { titleKey: "notify_support_admin_replied_title" },
      caseId: gate.case.id,
      publicCaseNo: gate.case.public_case_no,
      audience: gate.case.audience,
      storeId: gate.case.owner_store_id,
      dedupeKey: `support_admin_replied:${res.message.id}`,
      actorUserId: input.adminUserId,
    });
    // 재감사 D3: 답했다 = 그때까지 고객 글 알림은 어드민 전원에게 끝난 일
    await resolveSupportAdminNotifications(sb, gate.case.id);
  }

  // SSOT §8 F10: no "reply + close" in one call — a close right after the reply would hide
  // the answer before the customer reads it. Closing is its own action.
  return res;
}

export async function adminUpdateSupportCaseStatus(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; status: SupportCaseStatus }
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
  const { data, error } = await sb
    .from("support_cases")
    .update(patch)
    .eq("id", input.caseId)
    .eq("status", gate.case.status)
    .select("*")
    .maybeSingle();
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
      return { ok: false, error: "status_conflict" };
    }
    return { ok: false, error: error.message ?? "update_failed" };
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
    const resolvedLang = await loadNotificationUserLanguage(sb, gate.case.requester_user_id);
    await notifySupportEvent(sb, {
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
    });
  }

  return { ok: true, case: data as SupportCaseRow };
}

export async function adminAssignSupportCase(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; assigneeAdminId: string | null }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;

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

  const { data, error } = await sb
    .from("support_cases")
    .update({
      assigned_admin_id: input.assigneeAdminId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.caseId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "assign_failed" };

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
  if (error || !data) return { ok: false, error: error?.message ?? "priority_failed" };
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
    return { ok: false, error: error.message ?? "reopen_failed" };
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
    const reopenedLang = await loadNotificationUserLanguage(sb, gate.case.requester_user_id);
    await notifySupportEvent(sb, {
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
    });
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
  if (error) return { ok: false, error: error.message ?? "close_failed" };
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
 * IDEMPOTENT: when already 0, perform **no UPDATE** (no `updated_at` bump).
 * Prevents SupportModalHost Realtime `support_cases` UPDATE → GET → mark-read self-loop.
 */
export async function markSupportCaseReadForRequester(
  sb: SupabaseClient,
  input: {
    userId: string;
    caseId: string;
    /** 2차 재감사 E: 화면에 돌려준 글 목록의 기준 시각(문의 `last_message_at`). 그 뒤 새 글이 왔으면 읽음 0 으로 만들지 않는다 */
    seenLastMessageAt?: string | null;
  }
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
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
    .eq("requester_unread_count", unread);
  if (error) return { ok: false, error: error.message };
  return { ok: true, wrote: true };
}

/**
 * Phase 3 A3 — bell/app-icon read sync. Opening a case marks this viewer's unread
 * `support_*` notification_events for the same case read (same write shape as the legacy
 * `markMemberAdminNoteNotificationsRead`). Separate from the case-counter mark-read above:
 * touches only notification_events, so no support_cases UPDATE → Realtime self-loop.
 */
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
    const [others, replies] = await Promise.all([
      base().like("type", "support_%").neq("type", "support_admin_replied").select("id"),
      replyKeys.length > 0
        ? base().eq("type", "support_admin_replied").in("dedupe_key", replyKeys).select("id")
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
    ]);
    error = others.error ?? replies.error ?? null;
    data = [...((others.data ?? []) as { id: string }[]), ...((replies.data ?? []) as { id: string }[])];
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
  const adminRead = await markAdminNotificationsRead(sb, {
    adminUserId: uid,
    workRef: { table: "support_cases", id: caseId },
  });
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
  seenLastMessageAt?: string | null
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, caseId);
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
    .eq("admin_unread_count", unread);
  if (error) return { ok: false, error: error.message };
  return { ok: true, wrote: true };
}

export type AdminSupportSummary = {
  totalOpen: number;
  unassigned: number;
  waitingAdmin: number;
  /** Canonical status WAITING_USER count (alias waitingCustomer kept for A2-2 clients). */
  waitingUser: number;
  waitingCustomer: number;
  unreadCustomerReplies: number;
  /** Sidebar/ops badge — cases needing admin action (OPEN + WAITING_ADMIN). */
  actionable: number;
};

/**
 * A2-2 badge/dashboard SSOT. Actionable = OPEN | WAITING_ADMIN
 * (customer reply → WAITING_ADMIN; new case → OPEN). WAITING_USER is not actionable.
 */
export async function getAdminSupportSummary(
  sb: SupabaseClient
): Promise<{ ok: true; summary: AdminSupportSummary } | { ok: false; error: string }> {
  const active = ["OPEN", "WAITING_ADMIN", "WAITING_USER"] as const;

  const [
    totalOpenRes,
    unassignedRes,
    waitingAdminRes,
    waitingCustomerRes,
    unreadRes,
    actionableRes,
  ] = await Promise.all([
    sb.from("support_cases").select("id", { count: "exact", head: true }).in("status", [...active]),
    sb
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .in("status", [...active])
      .is("assigned_admin_id", null),
    sb.from("support_cases").select("id", { count: "exact", head: true }).eq("status", "WAITING_ADMIN"),
    sb.from("support_cases").select("id", { count: "exact", head: true }).eq("status", "WAITING_USER"),
    sb
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .in("status", [...active])
      .gt("admin_unread_count", 0),
    sb
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .in("status", ["OPEN", "WAITING_ADMIN"]),
  ]);

  const err =
    totalOpenRes.error ||
    unassignedRes.error ||
    waitingAdminRes.error ||
    waitingCustomerRes.error ||
    unreadRes.error ||
    actionableRes.error;
  if (err) {
    if (isMissingSupportTable(err.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: err.message };
  }

  const n = (c: number | null | undefined) => Math.max(0, Math.floor(Number(c) || 0));
  return {
    ok: true,
    summary: {
      totalOpen: n(totalOpenRes.count),
      unassigned: n(unassignedRes.count),
      waitingAdmin: n(waitingAdminRes.count),
      waitingUser: n(waitingCustomerRes.count),
      waitingCustomer: n(waitingCustomerRes.count),
      unreadCustomerReplies: n(unreadRes.count),
      actionable: n(actionableRes.count),
    },
  };
}

export { buildAdminSupportCaseRoute, buildSupportCaseRoute };
