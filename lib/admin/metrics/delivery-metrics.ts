/**
 * 배달 지표 정의 (R1 공통 기준 · 실행 계획 §5) — 지표 id 단일 정의.
 *
 * - 배달 대시보드(`/admin/delivery`)와 전체 관제 Action Center 배달 카드가 **같은 정의**를 읽는다.
 *   표시 중복은 허용, 정의 중복은 금지.
 * - 값을 확인할 수 없으면 `null` → 화면은 「확인 불가」 (0 표시 금지).
 * - 기간 기준 Asia/Manila (`period: "today_manila"`), 권한 범위는 처리 대기 레지스트리의
 *   `forbidden` 상태를 그대로 따른다.
 * - 모든 지표는 실제 처리 화면(`href`, 대상 화면이 읽는 URL 필터 포함)으로 이동한다.
 *
 * 클라이언트 안전 — 서버 전용 모듈 import 금지.
 */

import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { manilaDateKey } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import {
  getAdminActionQueueCategoryDef,
  type AdminActionQueueCategory,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";

export type DeliveryMetricId =
  | "delivery.store_applications_pending"
  | "delivery.stores_by_state.total"
  | "delivery.stores_by_state.open"
  | "delivery.stores_by_state.closed"
  | "delivery.stores_by_state.restricted"
  | "delivery.orders_new_today"
  | "delivery.orders_attention"
  | "delivery.orders_attention_recent"
  | "delivery.orders_stale_in_progress"
  | "delivery.orders_stale_attention"
  | "delivery.orders_stale_cancel_requested"
  | "delivery.orders_stale_refund_requested"
  | "delivery.orders_in_progress"
  | "delivery.orders_delivering"
  | "delivery.cancel_refund_requests.cancel"
  | "delivery.cancel_refund_requests.refund"
  | "delivery.alerts_open"
  | "delivery.auto_actions_failed"
  | "delivery.auto_actions_pending_approval"
  | "delivery.commission_review_required"
  | "delivery.cash_charge_pending"
  | "delivery.ads_pending"
  | "delivery.inquiries_open.store"
  | "delivery.inquiries_open.support"
  | "delivery.store_reports_open";

/** 값 출처 — 처리 대기 레지스트리(같은 Bell 페이로드) 또는 서버 로더의 직접 집계. */
export type DeliveryMetricSource =
  | { kind: "queue"; categories: readonly AdminActionQueueCategory[] }
  | { kind: "direct"; description: string };

/** `global` = 전체 관제 Action Center 배달 카드 전용 (배달 대시보드 구역에는 그리지 않는다). */
export type DeliveryMetricSection = "action" | "state" | "health" | "risk" | "global";

export type DeliveryMetricDefinition = {
  id: DeliveryMetricId;
  labelKo: string;
  labelEn: string;
  section: DeliveryMetricSection;
  source: DeliveryMetricSource;
  /**
   * "now" = 현재 상태 스냅샷, "today_manila" = 마닐라 오늘 00:00~,
   * "active_window" = 최근 7일(마닐라, 주문 목록 `period=last_7_days` 와 동일),
   * "stale" = 활성 기간 이전에 생성되어 아직 종결되지 않은 주문 (운영 위험).
   */
  period: "now" | "today_manila" | "active_window" | "stale";
  /** null = 활성 관리자 누구나 (처리 대기 레지스트리 권한과 동일) */
  permission: AdminPermissionKey | null;
  /** 처리 화면 + 그 화면이 실제로 읽는 URL 필터 */
  href: string;
  /** 0 이어도 표시할지 (처리 대기 카드는 0 이면 숨김) */
  showWhenZero: boolean;
};

function queueHref(key: AdminActionQueueCategory): string {
  const href = getAdminActionQueueCategoryDef(key).listHref;
  if (!href) throw new Error(`delivery_metric_queue_without_list_href:${key}`);
  return href;
}

function queuePermission(keys: readonly AdminActionQueueCategory[]): AdminPermissionKey | null {
  for (const k of keys) {
    const p = getAdminActionQueueCategoryDef(k).requiredPermission;
    if (p) return p;
  }
  return null;
}

function queueMetric(
  id: DeliveryMetricId,
  labelKo: string,
  labelEn: string,
  section: DeliveryMetricSection,
  category: AdminActionQueueCategory
): DeliveryMetricDefinition {
  return {
    id,
    labelKo,
    labelEn,
    section,
    source: { kind: "queue", categories: [category] },
    period: "now",
    permission: queuePermission([category]),
    href: queueHref(category),
    showWhenZero: false,
  };
}

export const DELIVERY_METRIC_DEFINITIONS: readonly DeliveryMetricDefinition[] = [
  // ── 지금 처리할 일 (처리 대기 레지스트리 — Bell 과 같은 값) ─────────────────
  // Bell 처리 대기(전 기간) — Action Center 배달 카드 전용. 대시보드는 아래 최근 7일 값을 쓴다.
  queueMetric("delivery.orders_attention", "처리 필요 주문", "Orders needing action", "global", "orders_attention"),
  {
    id: "delivery.orders_attention_recent",
    labelKo: "처리 필요 주문 (최근 7일)",
    labelEn: "Orders needing action (last 7 days)",
    section: "action",
    source: { kind: "direct", description: "store_orders.needs_admin_attention, open, created ∈ last 7 days (Manila)" },
    period: "active_window",
    permission: null,
    href: "/admin/store-orders?queue=admin_attention&period=last_7_days",
    showWhenZero: true,
  },
  queueMetric(
    "delivery.store_applications_pending",
    "입점 심사 대기",
    "Store applications pending",
    "action",
    "store_applications"
  ),
  queueMetric("delivery.alerts_open", "배달 경고 (미처리)", "Open delivery alerts", "action", "delivery_alerts"),
  {
    id: "delivery.auto_actions_failed",
    labelKo: "자동 조치 실패",
    labelEn: "Failed auto actions",
    section: "action",
    source: { kind: "direct", description: "delivery_operation_alert_actions.action_status=failed" },
    period: "now",
    permission: "business",
    href: "/admin/delivery-auto-actions?status=failed",
    showWhenZero: false,
  },
  {
    id: "delivery.auto_actions_pending_approval",
    labelKo: "자동 조치 승인 대기",
    labelEn: "Auto actions pending approval",
    section: "action",
    source: { kind: "direct", description: "delivery_operation_alert_actions.action_status=pending_approval" },
    period: "now",
    permission: "business",
    href: "/admin/delivery-auto-actions?status=pending_approval",
    showWhenZero: false,
  },
  queueMetric(
    "delivery.commission_review_required",
    "취소·환불 수수료 검토",
    "Commission review (cancel/refund)",
    "action",
    "settlements_actionable"
  ),
  queueMetric("delivery.cash_charge_pending", "매장 캐시 충전 승인 대기", "Store Cash top-ups pending", "action", "cash_charges"),
  queueMetric("delivery.ads_pending", "배달 광고 처리 필요", "Delivery ads need admin", "action", "delivery_ad_ops"),
  queueMetric("delivery.store_reports_open", "매장 신고 (미처리)", "Open store reports", "action", "store_reports"),
  queueMetric(
    "delivery.inquiries_open.support",
    "고객지원 처리 필요 (전체)",
    "Support needs attention (all)",
    "action",
    "support_actionable"
  ),
  // 매장 문의는 사장님이 답변 — Bell 합계 밖 (관찰용)
  queueMetric("delivery.inquiries_open.store", "매장 문의 (사장님 답변 대기)", "Store inquiries (owner to answer)", "risk", "store_inquiry_open"),

  // ── 현재 운영 상태 (매장) ────────────────────────────────────────────────
  {
    id: "delivery.stores_by_state.total",
    labelKo: "전체 매장",
    labelEn: "All stores",
    section: "state",
    source: { kind: "direct", description: "business_ops_kpi.totalStores" },
    period: "now",
    permission: null,
    href: "/admin/business",
    showWhenZero: true,
  },
  {
    id: "delivery.stores_by_state.open",
    labelKo: "영업 중",
    labelEn: "Open now",
    section: "state",
    source: { kind: "direct", description: "business_ops_kpi.openNow" },
    period: "now",
    permission: null,
    href: "/admin/business?open=open",
    showWhenZero: true,
  },
  {
    id: "delivery.stores_by_state.closed",
    labelKo: "영업 종료",
    labelEn: "Closed",
    section: "state",
    source: { kind: "direct", description: "business_ops_kpi.closedNow" },
    period: "now",
    permission: null,
    href: "/admin/business?open=closed",
    showWhenZero: true,
  },
  {
    id: "delivery.stores_by_state.restricted",
    labelKo: "운영 제한",
    labelEn: "Restricted",
    section: "state",
    source: { kind: "direct", description: "business_ops_kpi.restricted" },
    period: "now",
    permission: null,
    href: "/admin/business?restriction=yes",
    showWhenZero: true,
  },

  // ── 주문 상태 ────────────────────────────────────────────────────────────
  {
    id: "delivery.orders_new_today",
    labelKo: "오늘 신규 주문 (마닐라)",
    labelEn: "New orders today (Manila)",
    section: "health",
    source: { kind: "direct", description: "store_orders.created_at ∈ Manila today" },
    period: "today_manila",
    permission: null,
    href: "/admin/stores/orders?period=today",
    showWhenZero: true,
  },
  {
    id: "delivery.orders_in_progress",
    labelKo: "진행 중 주문 (최근 7일)",
    labelEn: "In-progress orders (last 7 days)",
    section: "health",
    source: { kind: "direct", description: "store_orders.order_status ∈ in_progress" },
    period: "active_window",
    permission: null,
    href: "/admin/stores/orders?tab=in_progress&period=last_7_days",
    showWhenZero: true,
  },
  {
    id: "delivery.orders_delivering",
    labelKo: "배달 중 (최근 7일)",
    labelEn: "Delivering (last 7 days)",
    section: "health",
    source: { kind: "direct", description: "store_orders.order_status=delivering" },
    period: "active_window",
    permission: null,
    href: "/admin/stores/orders?order_status=delivering&period=last_7_days",
    showWhenZero: true,
  },
  {
    id: "delivery.cancel_refund_requests.cancel",
    labelKo: "취소 요청 · 매장 결정 대기 (최근 7일)",
    labelEn: "Cancel requests awaiting store (last 7 days)",
    section: "health",
    source: { kind: "direct", description: "store_orders.order_status=cancel_requested" },
    period: "active_window",
    permission: null,
    href: "/admin/stores/orders?order_status=cancel_requested&period=last_7_days",
    showWhenZero: true,
  },
  {
    id: "delivery.cancel_refund_requests.refund",
    labelKo: "환불 요청 · 매장 결정 대기 (최근 7일)",
    labelEn: "Refund requests awaiting store (last 7 days)",
    section: "health",
    source: { kind: "direct", description: "store_orders.order_status=refund_requested" },
    period: "active_window",
    permission: null,
    href: "/admin/stores/orders?order_status=refund_requested&period=last_7_days",
    showWhenZero: true,
  },

  // ── 운영 위험: 활성 기간(최근 7일) 이전에 생성되어 아직 종결되지 않은 주문 ─────────
  // 현재 처리 업무로 세지 않는다. 링크(`period=custom&to=`)는 로더가 기준일로 채운다.
  {
    id: "delivery.orders_stale_in_progress",
    labelKo: "장기 미종결 주문 (7일 초과 · 접수 대기 포함)",
    labelEn: "Stale open orders (over 7 days, incl. unaccepted)",
    section: "risk",
    source: { kind: "direct", description: "store_orders.order_status ∈ in_progress tab (incl. pending), created before last 7 days" },
    period: "stale",
    permission: null,
    href: "/admin/stores/orders?tab=in_progress",
    showWhenZero: false,
  },
  {
    id: "delivery.orders_stale_attention",
    labelKo: "장기 미처리 관리자 확인 주문 (7일 초과)",
    labelEn: "Stale orders flagged for admin (over 7 days)",
    section: "risk",
    source: { kind: "direct", description: "store_orders.needs_admin_attention, open, created before last 7 days" },
    period: "stale",
    permission: null,
    href: "/admin/store-orders?queue=admin_attention",
    showWhenZero: false,
  },
  {
    id: "delivery.orders_stale_cancel_requested",
    labelKo: "장기 미결정 취소 요청 (7일 초과)",
    labelEn: "Stale cancel requests (over 7 days)",
    section: "risk",
    source: { kind: "direct", description: "store_orders.order_status=cancel_requested, created before last 7 days" },
    period: "stale",
    permission: null,
    href: "/admin/stores/orders?order_status=cancel_requested",
    showWhenZero: false,
  },
  {
    id: "delivery.orders_stale_refund_requested",
    labelKo: "장기 미결정 환불 요청 (7일 초과)",
    labelEn: "Stale refund requests (over 7 days)",
    section: "risk",
    source: { kind: "direct", description: "store_orders.order_status=refund_requested, created before last 7 days" },
    period: "stale",
    permission: null,
    href: "/admin/stores/orders?order_status=refund_requested",
    showWhenZero: false,
  },
];

export const DELIVERY_METRIC_BY_ID: ReadonlyMap<DeliveryMetricId, DeliveryMetricDefinition> = new Map(
  DELIVERY_METRIC_DEFINITIONS.map((d) => [d.id, d])
);

export function getDeliveryMetricDefinition(id: DeliveryMetricId): DeliveryMetricDefinition {
  const d = DELIVERY_METRIC_BY_ID.get(id);
  if (!d) throw new Error(`unknown_delivery_metric:${id}`);
  return d;
}

/**
 * 전체 관제 Action Center 「배달 운영」 카드 구성 지표 — 대시보드와 같은 id.
 * (주문 예외 + 배달 경고 + 입점 심사 대기; 모두 처리 대기 레지스트리 출처)
 */
export const DELIVERY_ACTION_CENTER_CARD_METRIC_IDS = [
  "delivery.orders_attention",
  "delivery.alerts_open",
  "delivery.store_applications_pending",
] as const satisfies readonly DeliveryMetricId[];

/** 배달 카드 CTA — 배달 대시보드 (X-4: 전체 주문 목록이 아니다). */
export const DELIVERY_DASHBOARD_HREF = "/admin/delivery" as const;

export type DeliveryMetricValue = {
  id: DeliveryMetricId;
  /** null = 확인 불가 (0 아님) */
  value: number | null;
  href: string;
  /** 권한 범위 밖 — 표시하지 않는다 */
  forbidden: boolean;
};

/** 처리 대기 레지스트리 결과 → 지표 값. 하나라도 ok 가 아니면 null (권한 없음은 forbidden). */
export function resolveDeliveryQueueMetric(
  def: DeliveryMetricDefinition,
  categories: readonly AdminActionQueueCategoryResult[] | null | undefined
): DeliveryMetricValue {
  if (def.source.kind !== "queue") {
    return { id: def.id, value: null, href: def.href, forbidden: false };
  }
  const list = categories ?? [];
  let sum = 0;
  let forbidden = false;
  let unavailable = list.length === 0;
  for (const key of def.source.categories) {
    const hit = list.find((c) => c.key === key);
    if (!hit) {
      unavailable = true;
      continue;
    }
    if (hit.status === "forbidden") {
      forbidden = true;
      continue;
    }
    if (hit.status !== "ok" || hit.count == null || !Number.isFinite(hit.count)) {
      unavailable = true;
      continue;
    }
    sum += hit.count;
  }
  return { id: def.id, value: forbidden || unavailable ? null : sum, href: def.href, forbidden };
}

/** 직접 집계 값(서버 로더) → 지표 값. 숫자가 아니면 null. */
export function resolveDeliveryDirectMetric(
  def: DeliveryMetricDefinition,
  raw: number | null | undefined,
  hrefOverride?: string | null
): DeliveryMetricValue {
  const ok = typeof raw === "number" && Number.isFinite(raw) && raw >= 0;
  return { id: def.id, value: ok ? Math.floor(raw as number) : null, href: hrefOverride || def.href, forbidden: false };
}

/**
 * 장기 정체 지표 링크 — 활성 기간 시작(마닐라 자정) 전날까지의 주문만 보이도록 `period=custom&to=` 를 붙인다.
 * 주문 목록의 `custom` 기간은 `to` 일자의 마닐라 하루 끝까지를 포함한다.
 */
export function deliveryStaleMetricHref(baseHref: string, activeWindowFromIso: string): string {
  const startMs = Date.parse(activeWindowFromIso);
  if (!Number.isFinite(startMs)) return baseHref;
  const lastStaleManilaDay = manilaDateKey(new Date(startMs - 1).toISOString());
  const sep = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${sep}period=custom&to=${lastStaleManilaDay}`;
}

export type DeliveryActionCenterCardValue = {
  href: typeof DELIVERY_DASHBOARD_HREF;
  /** null = 구성 지표 중 하나라도 확인 불가 */
  count: number | null;
  unavailable: boolean;
};

/** Action Center 배달 카드 — 대시보드와 같은 지표 정의로 합산. */
export function resolveDeliveryActionCenterCard(
  categories: readonly AdminActionQueueCategoryResult[] | null | undefined
): DeliveryActionCenterCardValue {
  let sum = 0;
  let unavailable = false;
  for (const id of DELIVERY_ACTION_CENTER_CARD_METRIC_IDS) {
    const v = resolveDeliveryQueueMetric(getDeliveryMetricDefinition(id), categories);
    if (v.forbidden) continue; // 권한 밖 지표는 합계에서 제외 (X-6)
    if (v.value == null) {
      unavailable = true;
      continue;
    }
    sum += v.value;
  }
  return { href: DELIVERY_DASHBOARD_HREF, count: unavailable ? null : sum, unavailable };
}

/** 지표 값 표시 — null 은 「확인 불가」 (0 표시 금지). */
export function formatDeliveryMetricValue(value: number | null | undefined, ko: boolean): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return ko ? "확인 불가" : "Unavailable";
  return formatAdminNumber(Math.round(value));
}
