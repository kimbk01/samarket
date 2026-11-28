/**
 * 고객센터 고객 알림(답변·종료·재오픈)의 문구·키·사건 모양 — **단일 정의** (2026-11-29 전체 수정).
 * 앱 즉시 발송(원장)·응답 뒤 다시 만들기·5분 대기열 작업자가 모두 이것만 쓴다 — 같은 dedupe 키·같은 문구.
 * 종료·재오픈 키는 DB 함수(`support_transition_case`)가 같은 트랜잭션에서 넣는 대기열 행의 키와 같아야 한다:
 *   종료 = `support_case_resolved:<문의 id>:<resolved_at>` · 재오픈 = `support_case_reopened:<문의 id>:<last_message_at>`
 *   (시각 = 문의 행을 jsonb 로 바꾼 문자열 — DB 함수 반환값 `to_jsonb(v_case)` 와 SQL `to_jsonb(v_case.x) #>> '{}'` 가 같다).
 */
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { notificationCopyMeta, type NotificationCopyMetaInput } from "@/lib/notifications/notification-stored-copy";
import { buildSupportCaseRoute, type SupportCaseRow } from "@/lib/support/support-case-types";

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

type Lang = Parameters<typeof notifySafeT>[0];

export function resolvedDedupeKey(c: Pick<SupportCaseRow, "id" | "resolved_at" | "updated_at">): string {
  return `support_case_resolved:${c.id}:${String(c.resolved_at ?? c.updated_at ?? "")}`;
}

export function reopenedDedupeKey(c: Pick<SupportCaseRow, "id" | "last_message_at" | "updated_at">): string {
  return `support_case_reopened:${c.id}:${String(c.last_message_at ?? c.updated_at ?? "")}`;
}

export function buildResolvedNotification(c: SupportCaseRow, actorUserId: string | undefined, lang: Lang): SupportRequesterNotificationInput {
  return {
    userId: c.requester_user_id,
    type: "support_case_resolved",
    title: notifySafeT(lang, "notify_support_case_resolved_title"),
    // Phase 3 A5 — fixed copy; `subject` is an internal "CATEGORY · surface" token.
    body: notifySafeT(lang, "notify_support_case_resolved_body"),
    copy: { titleKey: "notify_support_case_resolved_title", messageKey: "notify_support_case_resolved_body" },
    caseId: c.id,
    publicCaseNo: c.public_case_no,
    audience: c.audience,
    storeId: c.owner_store_id,
    dedupeKey: resolvedDedupeKey(c),
    actorUserId,
  };
}

export function buildReopenedNotification(c: SupportCaseRow, actorUserId: string | undefined, lang: Lang): SupportRequesterNotificationInput {
  return {
    userId: c.requester_user_id,
    type: "support_case_reopened",
    title: notifySafeT(lang, "notify_support_case_reopened_title"),
    body: notifySafeT(lang, "notify_support_case_reopened_body"),
    copy: { titleKey: "notify_support_case_reopened_title", messageKey: "notify_support_case_reopened_body" },
    caseId: c.id,
    publicCaseNo: c.public_case_no,
    audience: c.audience,
    storeId: c.owner_store_id,
    dedupeKey: reopenedDedupeKey(c),
    actorUserId,
  };
}

/** 알림 파이프라인(`createAndDispatchNotificationEvent`)에 넘기는 사건 모양 */
export function requesterNotificationEvent(input: SupportRequesterNotificationInput) {
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
