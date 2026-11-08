/**
 * 플랫폼 팝업 Admin 상태 라벨 (재설계 R5 · 네임스페이스 `platform.popup`) — 원시 상태 코드를 화면 1차 정보로 쓰지 않는다.
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace={PLATFORM_POPUP_…_NS} code={…} ko={ko} />`
 * 또는 `adminStatusLabelText(PLATFORM_POPUP_…_NS, code, ko)` 로 그린다. 미등록 코드 = 「알 수 없는 상태」(원문은 기술 정보).
 * 문구는 `lib/platform-popup/popup-product-labels.ts` 와 같다. Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** 팝업 캠페인 상태 — `PLATFORM_POPUP_CAMPAIGN_STATUSES` (lib/platform-popup/types.ts). */
export const PLATFORM_POPUP_STATUS_NS = "platform.popup";
registerAdminStatusLabels(PLATFORM_POPUP_STATUS_NS, {
  draft: { ...catalogPair("admin_draft"), tone: "neutral" },
  pending_review: { ...catalogPair("admin_pending_review"), tone: "warning" },
  approved: { ...catalogPair("admin_approved"), tone: "success" },
  scheduled: { ...catalogPair("admin_scheduled"), tone: "info" },
  active: { ...catalogPair("admin_live"), tone: "success" },
  paused: { ...catalogPair("admin_paused_5"), tone: "warning" },
  ended: { ...catalogPair("admin_ended"), tone: "neutral" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
});

/** 사장님 팝업 신청 상태 — `PLATFORM_POPUP_OWNER_REQUEST_STATUSES` (lib/platform-popup/owner-request-types.ts). */
export const PLATFORM_POPUP_REQUEST_STATUS_NS = "platform.popup.request";
registerAdminStatusLabels(PLATFORM_POPUP_REQUEST_STATUS_NS, {
  draft: { ...catalogPair("admin_draft"), tone: "neutral" },
  submitted: { ...catalogPair("admin_pending_review"), tone: "warning" },
  under_review: { ...catalogPair("admin_under_review_3"), tone: "info" },
  revision_required: { ...catalogPair("admin_revision_required"), tone: "warning" },
  approved: { ...catalogPair("admin_approved"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
  cancelled: { ...catalogPair("admin_cancelled_6"), tone: "neutral" },
});

/** 사장님 팝업 신청 결제 상태 — `PLATFORM_POPUP_OWNER_PAYMENT_STATUSES`. 결제 상태 ≠ 관리자 승인. */
export const PLATFORM_POPUP_PAYMENT_STATUS_NS = "platform.popup.payment";
registerAdminStatusLabels(PLATFORM_POPUP_PAYMENT_STATUS_NS, {
  unfunded: { ...catalogPair("admin_delivery_ads_funding_unfunded"), tone: "neutral" },
  funded: { ...catalogPair("admin_cash_paid"), tone: "success" },
  refunded: { ...catalogPair("admin_delivery_ads_funding_refunded"), tone: "neutral" },
  failed: { ...catalogPair("admin_do_ps_failed"), tone: "danger" },
});

/** 팝업·당겨서 새로고침 광고 캠페인 승인 상태 (`platform_popup_campaigns.approval_status`). */
export const PLATFORM_POPUP_APPROVAL_STATUS_NS = "platform.popup.approval";
registerAdminStatusLabels(PLATFORM_POPUP_APPROVAL_STATUS_NS, {
  not_submitted: { ...catalogPair("admin_not_submitted"), tone: "neutral" },
  pending_review: { ...catalogPair("admin_pending_review"), tone: "warning" },
  approved: { ...catalogPair("admin_approved"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
});
