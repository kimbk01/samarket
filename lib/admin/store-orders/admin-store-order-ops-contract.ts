/**
 * Admin order operations — one data engine, four independent list screens (v3 design §4, §6).
 *   주문 목록  /admin/stores/orders                 screen=list
 *   주문 액션  /admin/store-orders                   screen=exceptions   (Bell `orders_attention`)
 *   취소 요청  /admin/stores/orders/cancellations   screen=cancellations
 *   환불 요청  /admin/stores/orders/refunds         screen=refunds
 * SQL: supabase/migrations/20270513120000_admin_store_order_ops.sql (`admin_store_order_ops_page`,
 * `admin_store_order_ops_summary`). Each screen fixes its scope, tabs and period basis here; the
 * browser never derives status or money.
 */
import {
  STORE_ORDER_ADMIN_QUEUE_EXCLUDED_STATUSES,
  STORE_ORDER_CLOSED_STATUSES,
} from "@/lib/admin/admin-ops-actionable-status";
import {
  ADMIN_STORE_ORDERS_FULFILLMENT_TYPES,
  ADMIN_STORE_ORDERS_PAYMENT_STATUSES,
  ADMIN_STORE_ORDERS_TAB_STATUSES,
  type AdminStoreOrdersFulfillment,
  type AdminStoreOrdersPaymentStatus,
} from "@/lib/admin/store-orders/admin-store-orders-contract";
import { resolveStoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";
import type { StoreCommissionRowState } from "@/lib/stores/commission/store-commission-contract";
import { STORE_ORDER_STATUS_LIST, type StoreOrderStatus } from "@/lib/stores/order-status-transitions";

export const ADMIN_ORDER_OPS_PAGE_RPC = "admin_store_order_ops_page" as const;
export const ADMIN_ORDER_OPS_SUMMARY_RPC = "admin_store_order_ops_summary" as const;

export const ADMIN_ORDER_OPS_PAGE_SIZE = 50;
export const ADMIN_ORDER_OPS_MAX_PAGE_SIZE = 200;

export type AdminOrderOpsScreen = "list" | "exceptions" | "cancellations" | "refunds";
export const ADMIN_ORDER_OPS_SCREENS: readonly AdminOrderOpsScreen[] = ["list", "exceptions", "cancellations", "refunds"];

export const ADMIN_ORDER_OPS_PATH: Record<AdminOrderOpsScreen, string> = {
  list: "/admin/stores/orders",
  exceptions: "/admin/store-orders",
  cancellations: "/admin/stores/orders/cancellations",
  refunds: "/admin/stores/orders/refunds",
};

/** Period basis (D2) — every summary card / list states which instant it filters on. */
export type AdminOrderOpsBasis = "created" | "cancel_requested" | "cancelled" | "refund_requested" | "refunded";

export const ADMIN_ORDER_OPS_BASIS_LABEL: Record<AdminOrderOpsBasis, { ko: string; en: string }> = {
  created: { ko: "주문 생성 시각", en: "Order created" },
  cancel_requested: { ko: "취소 요청 시각", en: "Cancel requested" },
  cancelled: { ko: "취소 처리 시각", en: "Cancelled" },
  refund_requested: { ko: "환불 요청 시각", en: "Refund requested" },
  refunded: { ko: "환불 처리 시각", en: "Refunded" },
};

type TabDef = { key: string; ko: string; en: string; statuses: readonly StoreOrderStatus[]; basis: AdminOrderOpsBasis };

export type AdminOrderOpsScreenConfig = {
  titleKo: string;
  titleEn: string;
  descKo: string;
  descEn: string;
  /** Statuses this screen ever shows (null = all). */
  scope: readonly StoreOrderStatus[] | null;
  /** 주문 액션: attention flag minus closed / owner-decision rows (same as Bell). */
  exceptionsOnly: boolean;
  tabs: readonly TabDef[];
  defaultTab: string;
  /** Detail section opened first from this screen. */
  section: "requests" | "payment" | "admin" | null;
  summaryScope: "orders" | "cancel" | "refund" | null;
};

const IN_PROGRESS = ADMIN_STORE_ORDERS_TAB_STATUSES.in_progress;

export const ADMIN_ORDER_OPS_SCREEN: Record<AdminOrderOpsScreen, AdminOrderOpsScreenConfig> = {
  list: {
    titleKo: "주문 목록",
    titleEn: "Orders",
    descKo: "전체 주문을 조회합니다. 처리는 매장이 하고, 관리자는 조회·감독·예외 개입만 합니다.",
    descEn: "All orders. Stores run orders; admins observe and handle exceptions.",
    scope: null,
    exceptionsOnly: false,
    tabs: [
      { key: "all", ko: "전체", en: "All", statuses: [], basis: "created" },
      { key: "in_progress", ko: "진행 중", en: "In progress", statuses: IN_PROGRESS, basis: "created" },
      { key: "completed", ko: "완료", en: "Completed", statuses: ["completed"], basis: "created" },
      { key: "cancel", ko: "취소", en: "Cancel", statuses: ["cancel_requested", "cancelled"], basis: "created" },
      { key: "refund", ko: "환불", en: "Refund", statuses: ["refund_requested", "refunded"], basis: "created" },
    ],
    defaultTab: "all",
    section: null,
    summaryScope: "orders",
  },
  exceptions: {
    titleKo: "처리 필요 주문",
    titleEn: "Orders needing action",
    descKo: "관리자가 직접 처리해야 하는 운영 예외 주문입니다. 일반 취소·환불은 매장이 처리합니다.",
    descEn: "Exceptions the admin must handle. Regular cancel/refund decisions belong to the store.",
    scope: null,
    exceptionsOnly: true,
    tabs: [{ key: "all", ko: "운영 예외", en: "Exceptions", statuses: [], basis: "created" }],
    defaultTab: "all",
    section: "admin",
    summaryScope: null,
  },
  cancellations: {
    titleKo: "취소 요청",
    titleEn: "Cancellations",
    descKo: "취소 요청은 매장이 승인·반려합니다. 예외 개입은 주문 상세의 ‘관리자 작업’에서만 가능합니다.",
    descEn: "The store approves or rejects cancel requests. Exceptions only via the order detail.",
    scope: ["cancel_requested", "cancelled"],
    exceptionsOnly: false,
    tabs: [
      { key: "pending", ko: "매장 결정 대기", en: "Awaiting store", statuses: ["cancel_requested"], basis: "cancel_requested" },
      { key: "done", ko: "취소 완료", en: "Cancelled", statuses: ["cancelled"], basis: "cancelled" },
      { key: "all", ko: "전체", en: "All", statuses: [], basis: "created" },
    ],
    defaultTab: "pending",
    section: "requests",
    summaryScope: "cancel",
  },
  refunds: {
    titleKo: "환불 요청",
    titleEn: "Refunds",
    descKo: "환불 요청은 매장이 승인·반려합니다. 예외 개입은 주문 상세의 ‘관리자 작업’에서만 가능합니다.",
    descEn: "The store approves or rejects refund requests. Exceptions only via the order detail.",
    scope: ["refund_requested", "refunded"],
    exceptionsOnly: false,
    tabs: [
      { key: "pending", ko: "매장 결정 대기", en: "Awaiting store", statuses: ["refund_requested"], basis: "refund_requested" },
      { key: "done", ko: "환불 완료", en: "Refunded", statuses: ["refunded"], basis: "refunded" },
      { key: "all", ko: "전체", en: "All", statuses: [], basis: "created" },
    ],
    defaultTab: "pending",
    section: "payment",
    summaryScope: "refund",
  },
};

export type AdminOrderOpsPeriod = "all" | "today" | "last_7_days" | "last_30_days" | "this_month" | "this_year" | "custom";
export const ADMIN_ORDER_OPS_PERIODS: readonly AdminOrderOpsPeriod[] = ["today", "last_7_days", "last_30_days", "this_month", "this_year", "custom", "all"];
export const ADMIN_ORDER_OPS_PERIOD_LABEL: Record<AdminOrderOpsPeriod, { ko: string; en: string }> = {
  today: { ko: "오늘", en: "Today" },
  last_7_days: { ko: "최근 7일", en: "Last 7 days" },
  last_30_days: { ko: "최근 30일", en: "Last 30 days" },
  this_month: { ko: "이번 달", en: "This month" },
  this_year: { ko: "올해", en: "This year" },
  custom: { ko: "기간 지정", en: "Custom" },
  all: { ko: "전체 기간", en: "All time" },
};

const MANILA_OFFSET_MS = 8 * 3_600_000;

/** Manila business days (same calendar as the settlement ledger). Rolling N days include today. */
export function resolveAdminOrderOpsPeriod(
  period: AdminOrderOpsPeriod,
  fromDay: string | null,
  toDay: string | null,
  now: Date = new Date()
): { fromIso: string | null; toIso: string | null } {
  if (period === "last_7_days" || period === "last_30_days") {
    const today = resolveStoreCommissionPeriod("today", null, null, now);
    const days = period === "last_7_days" ? 7 : 30;
    const start = new Date(Date.parse(String(today.fromIso)) - (days - 1) * 86_400_000);
    return { fromIso: start.toISOString(), toIso: today.toIso };
  }
  if (period === "this_year") {
    // Manila 1 Jan 00:00 → end of today. Today's Manila midnight is 16:00Z the previous UTC day.
    const today = resolveStoreCommissionPeriod("today", null, null, now);
    const manilaYear = new Date(Date.parse(String(today.fromIso)) + MANILA_OFFSET_MS).getUTCFullYear();
    return { fromIso: new Date(Date.UTC(manilaYear, 0, 1) - MANILA_OFFSET_MS).toISOString(), toIso: today.toIso };
  }
  // 「전체 기간」 (`all`) = no bounds: every order since the service started, however many years.
  return resolveStoreCommissionPeriod(period, fromDay, toDay, now);
}

export const ADMIN_ORDER_OPS_PAYMENT_METHODS = ["cod", "gcash", "bank_transfer", "cash", "other", "none"] as const;
export type AdminOrderOpsPaymentMethod = (typeof ADMIN_ORDER_OPS_PAYMENT_METHODS)[number];

export type AdminOrderOpsQuery = {
  screen: AdminOrderOpsScreen;
  tab: string;
  q: string | null;
  orderStatus: StoreOrderStatus | null;
  paymentStatus: AdminStoreOrdersPaymentStatus | null;
  paymentMethod: AdminOrderOpsPaymentMethod | null;
  fulfillment: AdminStoreOrdersFulfillment | null;
  mismatchOnly: boolean;
  period: AdminOrderOpsPeriod;
  fromDay: string | null;
  toDay: string | null;
  storeId: string | null;
  orderId: string | null;
  buyerUserId: string | null;
  page: number;
  pageSize: number;
  asOf: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: string | null, max = 100): string | null => {
  const t = String(v ?? "").trim().slice(0, max);
  return t ? t : null;
};
const uuid = (v: string | null): string | null => (UUID_RE.test(String(v ?? "").trim()) ? String(v).trim() : null);
const day = (v: string | null): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").trim()) ? String(v).trim() : null);
function oneOf<T extends string>(v: string | null, list: readonly T[]): T | null {
  const t = String(v ?? "").trim();
  return (list as readonly string[]).includes(t) ? (t as T) : null;
}

/**
 * URL → query. Legacy `/admin/store-orders` params stay readable: `order_no` / `store_name` / `buyer`
 * fold into the unified search `q`, a legacy `tab` keeps its meaning on the list screen.
 */
export function parseAdminOrderOpsQuery(screen: AdminOrderOpsScreen, sp: URLSearchParams): AdminOrderOpsQuery {
  const cfg = ADMIN_ORDER_OPS_SCREEN[screen];
  const tabKeys = cfg.tabs.map((t) => t.key);
  const pageSize = Math.min(
    ADMIN_ORDER_OPS_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(sp.get("page_size")) || ADMIN_ORDER_OPS_PAGE_SIZE))
  );
  const asOfRaw = String(sp.get("as_of") ?? "").trim();
  const fromDay = day(sp.get("from"));
  const toDay = day(sp.get("to"));
  const periodParam = oneOf(sp.get("period"), ADMIN_ORDER_OPS_PERIODS);
  // Settlement-style `this_week` links → nearest rolling window.
  const period: AdminOrderOpsPeriod =
    periodParam ?? (sp.get("period") === "this_week" ? "last_7_days" : fromDay || toDay ? "custom" : "all");
  return {
    screen,
    tab: oneOf(sp.get("tab"), tabKeys) ?? cfg.defaultTab,
    q: text(sp.get("q"), 60) ?? text(sp.get("order_no"), 60) ?? text(sp.get("store_name")) ?? text(sp.get("buyer"), 60),
    orderStatus: oneOf(sp.get("order_status"), STORE_ORDER_STATUS_LIST),
    paymentStatus: oneOf(sp.get("payment_status"), ADMIN_STORE_ORDERS_PAYMENT_STATUSES),
    paymentMethod: oneOf(sp.get("payment_method"), ADMIN_ORDER_OPS_PAYMENT_METHODS),
    fulfillment: oneOf(sp.get("fulfillment"), ADMIN_STORE_ORDERS_FULFILLMENT_TYPES),
    mismatchOnly: sp.get("mismatch") === "1",
    period,
    fromDay,
    toDay,
    storeId: uuid(sp.get("store_id")),
    orderId: uuid(sp.get("order_id")),
    buyerUserId: uuid(sp.get("buyer_user_id")),
    page: Math.max(1, Math.floor(Number(sp.get("page")) || 1)),
    pageSize,
    asOf: asOfRaw && !Number.isNaN(Date.parse(asOfRaw)) ? new Date(asOfRaw).toISOString() : null,
  };
}

/** Query → URL params (screen URL and API). Defaults are omitted so URLs stay short and shareable. */
export function adminOrderOpsQueryToParams(q: AdminOrderOpsQuery, opts?: { includePaging?: boolean }): URLSearchParams {
  const cfg = ADMIN_ORDER_OPS_SCREEN[q.screen];
  const p = new URLSearchParams();
  if (q.tab !== cfg.defaultTab) p.set("tab", q.tab);
  if (q.q) p.set("q", q.q);
  if (q.orderStatus) p.set("order_status", q.orderStatus);
  if (q.paymentStatus) p.set("payment_status", q.paymentStatus);
  if (q.paymentMethod) p.set("payment_method", q.paymentMethod);
  if (q.fulfillment) p.set("fulfillment", q.fulfillment);
  if (q.mismatchOnly) p.set("mismatch", "1");
  if (q.period !== "all") p.set("period", q.period);
  if (q.period === "custom") {
    if (q.fromDay) p.set("from", q.fromDay);
    if (q.toDay) p.set("to", q.toDay);
  }
  if (q.storeId) p.set("store_id", q.storeId);
  if (q.orderId) p.set("order_id", q.orderId);
  if (q.buyerUserId) p.set("buyer_user_id", q.buyerUserId);
  if (opts?.includePaging) {
    if (q.page > 1) p.set("page", String(q.page));
    if (q.pageSize !== ADMIN_ORDER_OPS_PAGE_SIZE) p.set("page_size", String(q.pageSize));
    if (q.asOf) p.set("as_of", q.asOf);
  }
  // 주문 액션 URLs carry their marker so `legacyStoreOrdersRedirectTarget` never sends them to 주문 목록.
  if (q.screen === "exceptions" && p.toString() !== "") p.set("queue", "admin_attention");
  return p;
}

export function adminOrderOpsTab(q: Pick<AdminOrderOpsQuery, "screen" | "tab">): TabDef {
  const cfg = ADMIN_ORDER_OPS_SCREEN[q.screen];
  return cfg.tabs.find((t) => t.key === q.tab) ?? cfg.tabs[0];
}

export function adminOrderOpsRpcArgs(q: AdminOrderOpsQuery, now: Date = new Date()) {
  const cfg = ADMIN_ORDER_OPS_SCREEN[q.screen];
  const tab = adminOrderOpsTab(q);
  const range = resolveAdminOrderOpsPeriod(q.period, q.fromDay, q.toDay, now);
  const groups = Object.fromEntries(cfg.tabs.filter((t) => t.statuses.length > 0).map((t) => [t.key, t.statuses]));
  return {
    p_as_of: q.asOf,
    p_from: range.fromIso,
    p_to: range.toIso,
    p_basis: tab.basis,
    p_scope_statuses: cfg.scope ? [...cfg.scope] : null,
    p_tab_groups: groups,
    p_tab: tab.statuses.length > 0 ? tab.key : null,
    p_order_status: q.orderStatus,
    p_store_id: q.storeId,
    p_order_id: q.orderId,
    p_buyer_user_id: q.buyerUserId,
    p_q: q.q,
    p_fulfillment_type: q.fulfillment,
    p_payment_status: q.paymentStatus,
    p_payment_method: q.paymentMethod,
    p_mismatch_only: q.mismatchOnly,
    // 주문 액션 = Bell `orders_attention`: flag on, never closed or owner-decision rows (#62).
    p_queue_closed_statuses: cfg.exceptionsOnly ? [...STORE_ORDER_ADMIN_QUEUE_EXCLUDED_STATUSES] : null,
    p_limit: q.pageSize,
    p_offset: (q.page - 1) * q.pageSize,
  };
}

export type AdminOrderOpsRow = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  buyer_user_id: string;
  buyer_label: string;
  fulfillment_type: string;
  order_status: string;
  payment_status: string;
  buyer_payment_method: string | null;
  total_amount: number;
  payment_amount: number;
  discount_amount: number;
  gift_amount: number;
  gift_reversed: boolean;
  money_mismatch: boolean;
  created_at: string;
  basis_at: string;
  completed_at: string | null;
  sla_warning_level: string | null;
  sla_warning_reason: string | null;
  admin_locked: boolean;
  dispute_status: string | null;
  needs_admin_attention: boolean;
  delivery_status: string | null;
  rider_failure_reported_at: string | null;
  first_title: string | null;
  line_count: number;
  qty_total: number;
  cancel_requested_at: string | null;
  cancelled_at: string | null;
  refund_requested_at: string | null;
  refunded_at: string | null;
  cancel_requested_role: string | null;
  cancel_reason: string | null;
  cancel_request_status: string | null;
  cancel_decided_at: string | null;
  cancel_rejected_reason: string | null;
  refund_requested_role: string | null;
  refund_reason: string | null;
  decided_role: string | null;
  commission_state: StoreCommissionRowState | null;
};

export type AdminOrderOpsPageResult = {
  asOf: string;
  fetchedAt: string;
  total: number;
  page: number;
  pageSize: number;
  tabCounts: Record<string, number>;
  rows: AdminOrderOpsRow[];
};

/** 주문 액션 예외 사유 (D9) — only from existing records; no new criteria. */
export function adminOrderExceptionReason(r: AdminOrderOpsRow, ko: boolean): string {
  if (r.rider_failure_reported_at) return ko ? "라이더 실패 신고" : "Rider failure report";
  if (r.sla_warning_reason) return ko ? `SLA 경고: ${r.sla_warning_reason}` : `SLA warning: ${r.sla_warning_reason}`;
  if (r.needs_admin_attention) return ko ? "자동조치·복구 센터 표시" : "Flagged by auto-action / recovery";
  return ko ? "사유 기록 없음" : "No recorded reason";
}

/** Closed statuses (for row badges / exception copy). */
export const ADMIN_ORDER_OPS_CLOSED = new Set<string>(STORE_ORDER_CLOSED_STATUSES);

/** List-screen params on the legacy `/admin/store-orders` URL → those links mean 「주문 목록」. */
export const ADMIN_STORE_ORDERS_LEGACY_LIST_PARAMS = [
  "order_status",
  "store_id",
  "order_id",
  "buyer_user_id",
  "q",
  "order_no",
  "store_name",
  "buyer",
  "tab",
  "payment_status",
  "fulfillment",
  "period",
  "from",
  "to",
] as const;

export function legacyStoreOrdersRedirectTarget(sp: URLSearchParams): string | null {
  if (sp.get("queue") === "admin_attention") return null;
  const hasListParam = ADMIN_STORE_ORDERS_LEGACY_LIST_PARAMS.some((k) => (sp.get(k) ?? "").trim() !== "");
  if (!hasListParam) return null;
  const qs = sp.toString();
  return `${ADMIN_ORDER_OPS_PATH.list}?${qs}`;
}
