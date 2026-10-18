/**
 * Admin store orders (`/admin/store-orders`) — read SSOT contract.
 * Doc: docs/admin-store-orders-read-ssot.md
 * SQL: supabase/migrations/20270511120000_admin_store_orders_page.sql (`admin_store_orders_page`)
 *
 * The admin list is a read/oversight screen: the store owner runs the order.
 * Order status = `store_orders.order_status` (same column the owner writes),
 * commission (settlement) state = `store_commission_row_state` (same rule as the
 * settlement ledger). The browser never derives status or money.
 */
import {
  STORE_ORDER_ADMIN_QUEUE_EXCLUDED_STATUSES,
  STORE_ORDER_OWNER_DECISION_STATUSES,
} from "@/lib/admin/admin-ops-actionable-status";
import { STORE_ORDER_STATUS_LIST, type StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import {
  resolveStoreCommissionPeriod,
  STORE_COMMISSION_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import type { StoreCommissionRowState } from "@/lib/stores/commission/store-commission-contract";

export const ADMIN_STORE_ORDERS_PAGE_RPC = "admin_store_orders_page" as const;

export const ADMIN_STORE_ORDERS_PAGE_SIZE = 50;
export const ADMIN_STORE_ORDERS_MAX_PAGE_SIZE = 200;

export type AdminStoreOrdersTab = "all" | "in_progress" | "completed" | "cancel" | "refund";

export const ADMIN_STORE_ORDERS_TABS: readonly AdminStoreOrdersTab[] = [
  "all",
  "in_progress",
  "completed",
  "cancel",
  "refund",
] as const;

/** Tab → order statuses. Every status belongs to exactly one tab (test-locked). */
export const ADMIN_STORE_ORDERS_TAB_STATUSES: Record<Exclude<AdminStoreOrdersTab, "all">, readonly StoreOrderStatus[]> = {
  in_progress: ["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived"],
  completed: ["completed"],
  cancel: ["cancel_requested", "cancelled"],
  refund: ["refund_requested", "refunded"],
};

export const ADMIN_STORE_ORDERS_TAB_LABEL: Record<AdminStoreOrdersTab, { ko: string; en: string }> = {
  all: { ko: "전체 주문", en: "All orders" },
  in_progress: { ko: "진행 중", en: "In progress" },
  completed: { ko: "주문 완료", en: "Completed" },
  cancel: { ko: "취소", en: "Cancelled" },
  refund: { ko: "환불 관련", en: "Refunds" },
};

/** Waiting on a decision (owner request / buyer refund request). */
const DECISION_PENDING_STATUSES = new Set<string>(STORE_ORDER_OWNER_DECISION_STATUSES);

/** Order status chip — design tokens only (light + dark). */
export function adminStoreOrderStatusChipClass(status: string): string {
  if (DECISION_PENDING_STATUSES.has(status)) return "bg-sam-warning-soft text-sam-warning";
  if (status === "completed") return "bg-sam-success-soft text-sam-success";
  if (status === "cancelled" || status === "refunded") return "bg-sam-surface-muted text-sam-muted";
  return "bg-signature/10 text-signature";
}

export const ADMIN_STORE_ORDERS_FULFILLMENT_TYPES = ["local_delivery", "pickup", "shipping"] as const;
export type AdminStoreOrdersFulfillment = (typeof ADMIN_STORE_ORDERS_FULFILLMENT_TYPES)[number];

export const ADMIN_STORE_ORDERS_FULFILLMENT_LABEL: Record<AdminStoreOrdersFulfillment, { ko: string; en: string }> = {
  local_delivery: { ko: "배달", en: "Delivery" },
  pickup: { ko: "픽업", en: "Pickup" },
  shipping: { ko: "택배", en: "Shipping" },
};

/** `store_orders.payment_status` values (gift-funded orders also use `funded`). */
export const ADMIN_STORE_ORDERS_PAYMENT_STATUSES = ["pending", "paid", "funded", "failed", "cancelled", "refunded"] as const;
export type AdminStoreOrdersPaymentStatus = (typeof ADMIN_STORE_ORDERS_PAYMENT_STATUSES)[number];

export const ADMIN_STORE_ORDERS_PAYMENT_LABEL: Record<AdminStoreOrdersPaymentStatus, { ko: string; en: string }> = {
  pending: { ko: "결제 대기", en: "Pending" },
  paid: { ko: "결제 완료", en: "Paid" },
  funded: { ko: "상품권 결제", en: "Gift funded" },
  failed: { ko: "결제 실패", en: "Failed" },
  cancelled: { ko: "결제 취소", en: "Cancelled" },
  refunded: { ko: "환불 완료", en: "Refunded" },
};

/**
 * Payment terminal per order terminal — mirrors the writer
 * (`lib/stores/apply-store-order-status-transition.ts`: cancelled → cancelled|failed, refunded → refunded).
 * A row outside this map is a data-integrity exception (shown, never auto-corrected).
 */
export const ADMIN_STORE_ORDERS_TERMINAL_PAYMENT: Partial<Record<StoreOrderStatus, readonly string[]>> = {
  cancelled: ["cancelled", "failed"],
  refunded: ["refunded"],
};

export type AdminStoreOrderIntegrityFlag = "payment_status_mismatch" | "completion_record_missing";

export const ADMIN_STORE_ORDERS_INTEGRITY_LABEL: Record<AdminStoreOrderIntegrityFlag, { ko: string; en: string }> = {
  payment_status_mismatch: { ko: "결제 상태 불일치", en: "Payment status mismatch" },
  completion_record_missing: { ko: "완료 기록 없음", en: "No completion record" },
};

export function adminStoreOrderIntegrityFlags(row: {
  order_status: string;
  payment_status: string;
  completed_at: string | null;
}): AdminStoreOrderIntegrityFlag[] {
  const flags: AdminStoreOrderIntegrityFlag[] = [];
  const expected = ADMIN_STORE_ORDERS_TERMINAL_PAYMENT[row.order_status as StoreOrderStatus];
  if (expected && !expected.includes(row.payment_status)) flags.push("payment_status_mismatch");
  if (row.order_status === "completed" && !row.completed_at) flags.push("completion_record_missing");
  return flags;
}

export type AdminStoreOrdersQuery = {
  tab: AdminStoreOrdersTab;
  orderStatus: StoreOrderStatus | null;
  storeName: string | null;
  orderNo: string | null;
  buyer: string | null;
  period: StoreCommissionPeriod;
  fromDay: string | null;
  toDay: string | null;
  fulfillment: AdminStoreOrdersFulfillment | null;
  paymentStatus: AdminStoreOrdersPaymentStatus | null;
  /** Deep links (Action Center, order chats, finance screens) — kept as exact filters. */
  storeId: string | null;
  orderId: string | null;
  buyerUserId: string | null;
  adminQueue: boolean;
  page: number;
  pageSize: number;
  /** Snapshot instant for page-to-page consistency (null = server now). */
  asOf: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(v: string | null, max = 100): string | null {
  const t = String(v ?? "").trim().slice(0, max);
  return t ? t : null;
}

function uuid(v: string | null): string | null {
  const t = String(v ?? "").trim();
  return UUID_RE.test(t) ? t : null;
}

function day(v: string | null): string | null {
  const t = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function oneOf<T extends string>(v: string | null, list: readonly T[]): T | null {
  const t = String(v ?? "").trim();
  return (list as readonly string[]).includes(t) ? (t as T) : null;
}

export function parseAdminStoreOrdersQuery(sp: URLSearchParams): AdminStoreOrdersQuery {
  const pageSize = Math.min(
    ADMIN_STORE_ORDERS_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(sp.get("page_size")) || ADMIN_STORE_ORDERS_PAGE_SIZE))
  );
  const asOfRaw = String(sp.get("as_of") ?? "").trim();
  return {
    tab: oneOf(sp.get("tab"), ADMIN_STORE_ORDERS_TABS) ?? "all",
    orderStatus: oneOf(sp.get("order_status"), STORE_ORDER_STATUS_LIST),
    storeName: text(sp.get("store_name")),
    orderNo: text(sp.get("order_no"), 60),
    buyer: text(sp.get("buyer"), 60),
    period: oneOf(sp.get("period"), STORE_COMMISSION_PERIODS) ?? "all",
    fromDay: day(sp.get("from")),
    toDay: day(sp.get("to")),
    fulfillment: oneOf(sp.get("fulfillment"), ADMIN_STORE_ORDERS_FULFILLMENT_TYPES),
    paymentStatus: oneOf(sp.get("payment_status"), ADMIN_STORE_ORDERS_PAYMENT_STATUSES),
    storeId: uuid(sp.get("store_id")),
    orderId: uuid(sp.get("order_id")),
    buyerUserId: uuid(sp.get("buyer_user_id")),
    adminQueue: sp.get("queue") === "admin_attention",
    page: Math.max(1, Math.floor(Number(sp.get("page")) || 1)),
    pageSize,
    asOf: asOfRaw && !Number.isNaN(Date.parse(asOfRaw)) ? new Date(asOfRaw).toISOString() : null,
  };
}

/** URL params for the screen and the API (page/as_of omitted when default). */
export function adminStoreOrdersQueryToParams(
  q: Partial<AdminStoreOrdersQuery>,
  opts?: { includePaging?: boolean }
): URLSearchParams {
  const p = new URLSearchParams();
  if (q.tab && q.tab !== "all") p.set("tab", q.tab);
  if (q.orderStatus) p.set("order_status", q.orderStatus);
  if (q.storeName) p.set("store_name", q.storeName);
  if (q.orderNo) p.set("order_no", q.orderNo);
  if (q.buyer) p.set("buyer", q.buyer);
  if (q.period && q.period !== "all") p.set("period", q.period);
  if (q.period === "custom") {
    if (q.fromDay) p.set("from", q.fromDay);
    if (q.toDay) p.set("to", q.toDay);
  }
  if (q.fulfillment) p.set("fulfillment", q.fulfillment);
  if (q.paymentStatus) p.set("payment_status", q.paymentStatus);
  if (q.storeId) p.set("store_id", q.storeId);
  if (q.orderId) p.set("order_id", q.orderId);
  if (q.buyerUserId) p.set("buyer_user_id", q.buyerUserId);
  if (q.adminQueue) p.set("queue", "admin_attention");
  if (opts?.includePaging) {
    if (q.page && q.page > 1) p.set("page", String(q.page));
    if (q.pageSize && q.pageSize !== ADMIN_STORE_ORDERS_PAGE_SIZE) p.set("page_size", String(q.pageSize));
    if (q.asOf) p.set("as_of", q.asOf);
  }
  return p;
}

/** RPC arguments — status groups and the admin queue predicate come from this contract. */
export function adminStoreOrdersRpcArgs(q: AdminStoreOrdersQuery, now: Date = new Date()) {
  const range = resolveStoreCommissionPeriod(q.period, q.fromDay, q.toDay, now);
  return {
    p_as_of: q.asOf,
    p_from: range.fromIso,
    p_to: range.toIso,
    p_tab_groups: ADMIN_STORE_ORDERS_TAB_STATUSES,
    p_tab: q.tab === "all" ? null : q.tab,
    p_order_status: q.orderStatus,
    p_store_id: q.storeId,
    p_store_name: q.storeName,
    p_order_id: q.orderId,
    p_order_no: q.orderNo,
    p_buyer_user_id: q.buyerUserId,
    p_buyer_q: q.buyer,
    p_fulfillment_type: q.fulfillment,
    p_payment_status: q.paymentStatus,
    // Admin Q (`orders_attention`): attention flag only, never closed or owner-decision rows.
    // An empty status list keeps the SQL queue branch on (NULL would disable the queue filter).
    p_queue_statuses: q.adminQueue ? [] : null,
    p_queue_closed_statuses: q.adminQueue ? [...STORE_ORDER_ADMIN_QUEUE_EXCLUDED_STATUSES] : null,
    p_limit: q.pageSize,
    p_offset: (q.page - 1) * q.pageSize,
  };
}

export type AdminStoreOrderListRow = {
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
  gift_redemption_amount: number;
  created_at: string;
  completed_at: string | null;
  sla_warning_level: string | null;
  admin_locked: boolean;
  dispute_status: string | null;
  delivery_status: string | null;
  first_title: string | null;
  line_count: number;
  qty_total: number;
  commission_state: StoreCommissionRowState | null;
  integrity_flags: AdminStoreOrderIntegrityFlag[];
};

export type AdminStoreOrdersPageResult = {
  asOf: string;
  fetchedAt: string;
  total: number;
  page: number;
  pageSize: number;
  tabCounts: Record<AdminStoreOrdersTab, number>;
  rows: AdminStoreOrderListRow[];
};
