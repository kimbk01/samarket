import { translate } from "@/lib/i18n/messages";
import { ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT } from "@/lib/stores/store-order-process-model";
/**
 * 배달 Admin 상태 라벨 레지스트리 (R1 공통 기준) — 원시 상태값을 운영자 한국어/영어로.
 * 미등록 코드는 「알 수 없는 상태」로 표시하고 원시 값은 기술 정보에서만 보여준다.
 */

import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { catalogPair } from "@/lib/i18n/catalog-pair";

export type AdminStatusLabel = { ko: string; en: string; tone: AdminTone };

type Registry = Record<string, AdminStatusLabel>;

const STORE_APPROVAL: Registry = {
  pending: { ...catalogPair("admin_pending_4"), tone: "waiting" },
  under_review: { ...catalogPair("admin_under_review_2"), tone: "progress" },
  revision_requested: { ...catalogPair("admin_changes_requested"), tone: "warning" },
  approved: { ...catalogPair("admin_approved"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
  suspended: { ...catalogPair("admin_suspended_5"), tone: "danger" },
};

const STORE_SALES: Registry = {
  approved: { ...catalogPair("admin_selling"), tone: "success" },
  pending: { ...catalogPair("admin_sales_pending"), tone: "waiting" },
  rejected: { ...catalogPair("admin_sales_rejected"), tone: "danger" },
  suspended: { ...catalogPair("admin_sales_suspended"), tone: "danger" },
};

const REPORT: Registry = {
  pending: { ...catalogPair("admin_chat_reports_status_received"), tone: "waiting" },
  open: { ...catalogPair("admin_chat_reports_status_received"), tone: "waiting" },
  reviewing: { ...catalogPair("admin_chat_reports_status_reviewing"), tone: "progress" },
  actioned: { ...catalogPair("admin_stores_reports_actioned"), tone: "success" },
  resolved: { ...catalogPair("admin_chat_reports_status_resolved"), tone: "success" },
  dismissed: { ...catalogPair("admin_chat_reports_status_dismissed"), tone: "neutral" },
};

const REVIEW: Registry = {
  visible: { ...catalogPair("admin_visible_2"), tone: "success" },
  active: { ...catalogPair("admin_visible_2"), tone: "success" },
  published: { ...catalogPair("admin_visible_2"), tone: "success" },
  hidden: { ...catalogPair("admin_trade_post_status_hidden"), tone: "warning" },
  deleted: { ...catalogPair("admin_ads_history_filter_deleted"), tone: "neutral" },
};

const PRODUCT: Registry = {
  active: { ...catalogPair("admin_trade_post_status_active"), tone: "success" },
  sold_out: { ...catalogPair("admin_stores_product_filter_sold_out"), tone: "warning" },
  hidden: { ...catalogPair("admin_trade_post_status_hidden"), tone: "warning" },
  blocked: { ...catalogPair("admin_blocked"), tone: "danger" },
  deleted: { ...catalogPair("admin_ads_history_filter_deleted"), tone: "neutral" },
  draft: { ...catalogPair("admin_draft"), tone: "neutral" },
};

const PRODUCT_REVIEW: Registry = {
  pending: { ...catalogPair("admin_review_pending"), tone: "waiting" },
  approved: { ...catalogPair("admin_review_approved"), tone: "success" },
  rejected: { ...catalogPair("admin_review_rejected"), tone: "danger" },
  none: { ...catalogPair("admin_not_reviewed"), tone: "neutral" },
};

const COUPON: Registry = {
  draft: { ...catalogPair("admin_draft"), tone: "neutral" },
  requested: { ...catalogPair("admin_requested_2"), tone: "waiting" },
  approved: { ...catalogPair("admin_delivery_ads_lifecycle_approved"), tone: "progress" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
  scheduled: { ...catalogPair("admin_scheduled_3"), tone: "progress" },
  active: { ...catalogPair("admin_chat_calls_tab_active"), tone: "success" },
  paused: { ...catalogPair("admin_paused_3"), tone: "warning" },
  ended: { ...catalogPair("admin_ended"), tone: "neutral" },
  revoked: { ...catalogPair("admin_revoked"), tone: "danger" },
};

const RIDER_DELIVERY: Registry = {
  waiting_rider: { ...catalogPair("admin_waiting_for_rider_2"), tone: "waiting" },
  rider_assigned: { ...catalogPair("admin_rider_assigned_2"), tone: "progress" },
  pickup_in_progress: { ...catalogPair("admin_picking_up"), tone: "progress" },
  delivery_failed: { ...catalogPair("admin_delivery_failed"), tone: "danger" },
  assigned: { ...catalogPair("admin_assigned"), tone: "progress" },
  picked_up: { ...catalogPair("admin_picked_up"), tone: "progress" },
  delivering: { ...catalogPair("admin_delivering"), tone: "progress" },
  delivered: { ...catalogPair("admin_delivered"), tone: "success" },
  failed: { ...catalogPair("admin_failed_2"), tone: "danger" },
  cancelled: { ...catalogPair("admin_cancelled_3"), tone: "neutral" },
};

/** 매장 주문 상태 (`store_orders.order_status`) — 배달 현장 화면 표시용. */
/** 매장 주문 상태 이름 = 4단계 정본 키 (사장님·손님·채팅과 같은 말 · 설계안 v2 §3-1) */
function storeOrderStatusRegistry<T extends string>(tones: Record<keyof typeof ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT, T>) {
  const out: Record<string, { ko: string; en: string; tone: T }> = {};
  for (const [status, key] of Object.entries(ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT)) {
    out[status] = {
      ko: translate("ko", key),
      en: translate("en", key),
      tone: tones[status as keyof typeof ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT],
    };
  }
  return out;
}

const STORE_ORDER: Registry = storeOrderStatusRegistry({
  pending: "waiting",
  accepted: "progress",
  preparing: "progress",
  ready_for_pickup: "progress",
  delivering: "progress",
  arrived: "progress",
  completed: "success",
  cancel_requested: "warning",
  cancelled: "neutral",
  refund_requested: "warning",
  refunded: "neutral",
});

/** 배달 경고 이벤트 상태 (`delivery_operation_alert_events.event_status`). */
const ALERT_EVENT: Registry = {
  open: { ...catalogPair("admin_open_3"), tone: "danger" },
  acknowledged: { ...catalogPair("admin_acknowledged"), tone: "progress" },
  muted: { ...catalogPair("admin_muted"), tone: "neutral" },
  resolved: { ...catalogPair("admin_rec_incident_status_resolved"), tone: "success" },
};

/** 배달 경고 심각도 (`severity` / `warning_level`). */
const ALERT_SEVERITY: Registry = {
  info: { ...catalogPair("admin_info"), tone: "neutral" },
  warning: { ...catalogPair("admin_system_health_status_warning"), tone: "warning" },
  critical: { ...catalogPair("admin_r4d_severity_critical"), tone: "danger" },
};

/** 자동 조치 실행 상태 (`delivery_operation_alert_actions.action_status`). */
const AUTO_ACTION: Registry = {
  pending_approval: { ...catalogPair("admin_del_alert_filter_pending_approval"), tone: "waiting" },
  success: { ...catalogPair("admin_succeeded"), tone: "success" },
  failed: { ...catalogPair("admin_meeting_engine_err_generic"), tone: "danger" },
  rejected: { ...catalogPair("admin_rejected_3"), tone: "neutral" },
  skipped: { ...catalogPair("admin_skipped"), tone: "neutral" },
};

/** 라이더 관리자 상태 (`delivery_riders.admin_status`). */
const RIDER_ADMIN: Registry = {
  ok: { ...catalogPair("admin_rec_auto_recovery_normal"), tone: "success" },
  flagged: { ...catalogPair("admin_ops_console_focus_attention"), tone: "warning" },
  paused: { ...catalogPair("admin_paused_4"), tone: "warning" },
};

/** 회원 상태 (`profiles.status`) — 매장 허브 「사장님 회원」 요약. */
const MEMBER: Registry = {
  active: { ...catalogPair("admin_users_lite_status_active"), tone: "success" },
  verified_user: { ...catalogPair("admin_users_lite_status_active"), tone: "success" },
  sns_pending: { ...catalogPair("admin_users_lite_status_active"), tone: "success" },
  suspended: { ...catalogPair("admin_users_mod_status_suspended"), tone: "danger" },
  blocked: { ...catalogPair("admin_users_mod_status_blocked"), tone: "danger" },
  withdrawn: { ...catalogPair("admin_withdrawn"), tone: "neutral" },
  deleted: { ...catalogPair("admin_withdrawn"), tone: "neutral" },
  deactivated: { ...catalogPair("admin_withdrawn"), tone: "neutral" },
};

/** 매장 문의 상태 (`store_inquiries.status`). */
const INQUIRY: Registry = {
  open: { ...catalogPair("admin_unanswered"), tone: "waiting" },
  answered: { ...catalogPair("admin_platform_inquiry_status_answered"), tone: "success" },
  closed: { ...catalogPair("admin_stores_inquiries_status_closed"), tone: "neutral" },
  escalated: { ...catalogPair("admin_escalated"), tone: "warning" },
};

const REGISTRIES = {
  member: MEMBER,
  inquiry: INQUIRY,
  store_approval: STORE_APPROVAL,
  store_sales: STORE_SALES,
  report: REPORT,
  review: REVIEW,
  product: PRODUCT,
  product_review: PRODUCT_REVIEW,
  coupon: COUPON,
  rider_delivery: RIDER_DELIVERY,
  store_order: STORE_ORDER,
  alert_event: ALERT_EVENT,
  alert_severity: ALERT_SEVERITY,
  auto_action: AUTO_ACTION,
  rider_admin: RIDER_ADMIN,
} as const;

export type AdminStatusDomain = keyof typeof REGISTRIES;

export function adminStatusLabel(
  domain: AdminStatusDomain,
  raw: string | null | undefined,
  ko: boolean
): { label: string; tone: AdminTone; known: boolean } {
  const key = String(raw ?? "").trim().toLowerCase();
  const hit = REGISTRIES[domain][key];
  if (hit) return { label: ko ? hit.ko : hit.en, tone: hit.tone, known: true };
  if (!key) return { label: "—", tone: "neutral", known: false };
  return { label: ko ? "알 수 없는 상태" : "Unknown status", tone: "neutral", known: false };
}
