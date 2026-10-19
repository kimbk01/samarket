/**
 * Admin 입점·운영·판매 결정 — 서버 상태 전이표 (DEF-11).
 * 클라이언트(화면)와 서버(API)가 함께 쓰는 순수 규칙 — 서버 전용 모듈을 import 하지 않는다.
 */

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
