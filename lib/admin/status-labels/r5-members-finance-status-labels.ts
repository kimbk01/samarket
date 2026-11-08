/**
 * 재설계 R5 상태 라벨 — 회원 계정 상태(`members.accountStatus`) · 결제 상태(`finance.payment`).
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace={…} code=… ko=… />` 또는
 * `adminStatusLabelText(…)` 로만 그린다. 미등록 값 = 「알 수 없는 상태」(원문은 기술 정보에서만).
 * Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/**
 * 회원 계정 상태 — `profiles.status` · `moderation_status` · 회원 생애주기(ACTIVE/SUSPENDED/BLOCKED/WITHDRAWN/PURGED,
 * `normalizeMemberAdminLifecycle`). 코드는 소문자로 조회된다.
 */
export const MEMBERS_ACCOUNT_STATUS_NS = "members.accountStatus";
registerAdminStatusLabels(MEMBERS_ACCOUNT_STATUS_NS, {
  active: { ...catalogPair("admin_users_lite_status_active"), tone: "success" },
  normal: { ...catalogPair("admin_users_lite_status_active"), tone: "success" },
  warned: { ...catalogPair("admin_users_mod_status_warned"), tone: "warning" },
  warning: { ...catalogPair("admin_users_mod_status_warned"), tone: "warning" },
  needs_review: { ...catalogPair("admin_delivery_ads_case_waiting_admin"), tone: "warning" },
  suspended: { ...catalogPair("admin_suspended"), tone: "danger" },
  blocked: { ...catalogPair("admin_banned"), tone: "danger" },
  banned: { ...catalogPair("admin_banned"), tone: "danger" },
  withdrawn: { ...catalogPair("admin_withdrawn"), tone: "neutral" },
  deleted: { ...catalogPair("admin_withdrawn"), tone: "neutral" },
  deactivated: { ...catalogPair("admin_withdrawn"), tone: "neutral" },
  purged: { ...catalogPair("admin_purged"), tone: "neutral" },
});

/**
 * 결제 상태 — 매장·배달 주문 `payment_status`(pending/paid/funded/failed/cancelled/refunded) ·
 * 광고 신청 결제(pending/checking/confirmed/rejected/cancelled) · 팝업 신청 결제(unfunded/funded/refunded/failed).
 */
export const FINANCE_PAYMENT_STATUS_NS = "finance.payment";
registerAdminStatusLabels(FINANCE_PAYMENT_STATUS_NS, {
  pending: { ...catalogPair("admin_pending"), tone: "neutral" },
  unpaid: { ...catalogPair("admin_ads_payment_status_unpaid"), tone: "neutral" },
  unfunded: { ...catalogPair("admin_ads_payment_status_unpaid"), tone: "neutral" },
  checking: { ...catalogPair("admin_checking"), tone: "info" },
  confirmed: { ...catalogPair("admin_confirmed"), tone: "success" },
  paid: { ...catalogPair("admin_paid_2"), tone: "success" },
  funded: { ...catalogPair("admin_delivery_ads_funding_funded"), tone: "success" },
  failed: { ...catalogPair("admin_failed"), tone: "danger" },
  rejected: { ...catalogPair("admin_rejected_4"), tone: "neutral" },
  cancelled: { ...catalogPair("admin_cancelled"), tone: "neutral" },
  refund_pending: { ...catalogPair("admin_refund_pending"), tone: "warning" },
  partially_refunded: { ...catalogPair("admin_partially_refunded"), tone: "warning" },
  refunded: { ...catalogPair("admin_do_ps_refunded"), tone: "neutral" },
});
