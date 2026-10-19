/**
 * Admin 입점·운영·판매 결정 — 서버 상태 전이표 + 사장님 알림 (DEF-11 / DEF-17 / DEF-67).
 * 쓰기 권위: PATCH /api/admin/stores/[id] 만 사용한다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "@/lib/i18n/messages";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { OwnerRoutes } from "@/lib/business/owner-routes";

export type AdminStoreApprovalAction =
  | "start_review"
  | "mark_under_review"
  | "approve_store"
  | "reject_store"
  | "request_revision"
  | "suspend_store"
  | "resume_store";

/** 현재 승인 상태 → 허용되는 결정. 목록에 없는 전이는 409 `invalid_store_transition`. */
const ALLOWED_FROM: Record<AdminStoreApprovalAction, readonly string[]> = {
  start_review: ["pending", "revision_requested"],
  mark_under_review: ["pending", "revision_requested"],
  approve_store: ["pending", "under_review", "revision_requested"],
  reject_store: ["pending", "under_review", "revision_requested"],
  request_revision: ["pending", "under_review"],
  suspend_store: ["approved"],
  resume_store: ["suspended"],
};

export function isAdminStoreTransitionAllowed(
  action: AdminStoreApprovalAction,
  currentStatus: string | null | undefined
): boolean {
  return ALLOWED_FROM[action].includes(String(currentStatus ?? "").trim());
}

export function allowedStoreApprovalActions(
  currentStatus: string | null | undefined
): AdminStoreApprovalAction[] {
  const s = String(currentStatus ?? "").trim();
  return (Object.keys(ALLOWED_FROM) as AdminStoreApprovalAction[]).filter((a) =>
    ALLOWED_FROM[a].includes(s)
  );
}

/** 사유가 필요한 결정 (L2): 거절·보완 요청·운영 중지·판매 거절·판매 중지 */
export const ADMIN_STORE_ACTIONS_REQUIRING_REASON = new Set<string>([
  "reject_store",
  "request_revision",
  "suspend_store",
  "reject_sales",
  "suspend_sales",
]);

export const ADMIN_STORE_REASON_MIN_LENGTH = 2;

type DecisionKey =
  | "approved"
  | "rejected"
  | "revision_requested"
  | "suspended"
  | "resumed"
  | "sales_approved"
  | "sales_rejected"
  | "sales_suspended";

const DECISION_BY_ACTION: Partial<Record<string, DecisionKey>> = {
  approve_store: "approved",
  reject_store: "rejected",
  request_revision: "revision_requested",
  suspend_store: "suspended",
  resume_store: "resumed",
  approve_sales: "sales_approved",
  reject_sales: "sales_rejected",
  suspend_sales: "sales_suspended",
};

export function ownerNotifiableStoreDecision(action: string): boolean {
  return Boolean(DECISION_BY_ACTION[action]);
}

/** 결정 직후 사장님 알림 — 실패해도 결정 자체는 유지(로그만). */
export async function safeNotifyOwnerStoreDecision(
  sb: SupabaseClient,
  input: {
    action: string;
    storeId: string;
    ownerUserId: string | null | undefined;
    storeName: string | null | undefined;
    reason: string | null;
    adminActorId: string | null;
  }
): Promise<boolean> {
  const decision = DECISION_BY_ACTION[input.action];
  const ownerUserId = String(input.ownerUserId ?? "").trim();
  if (!decision || !ownerUserId) return false;
  try {
    const language = await loadNotificationUserLanguage(sb, ownerUserId);
    const store = String(input.storeName ?? "").trim() || "-";
    const reason = String(input.reason ?? "").trim() || "-";
    const vars = { store, reason };
    return await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "system",
      push_kind: "notice",
      domain: "store",
      ref_id: input.storeId,
      title: notifySafeT(language, `notify_store_decision_${decision}_title` as MessageKey),
      body: notifySafeT(language, `notify_store_decision_${decision}_body` as MessageKey, { vars }),
      link_url: OwnerRoutes.hub(input.storeId),
      dedupe_key: `admin_store_decision:${input.storeId}:${input.action}:${Date.now()}`,
      meta: {
        kind: "admin_store_decision",
        action: input.action,
        store_id: input.storeId,
        reason: input.reason,
        admin_actor_id: input.adminActorId,
      },
    });
  } catch (err) {
    console.error("[safeNotifyOwnerStoreDecision]", input.storeId, input.action, err);
    return false;
  }
}
