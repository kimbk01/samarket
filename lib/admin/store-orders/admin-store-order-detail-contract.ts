/**
 * Admin store order detail — money / items / request SSOT shared by every order-ops screen
 * (주문 목록 · 주문 액션 · 취소 요청 · 환불 요청 · 감사 로그 · 주문 채팅) through the one detail modal.
 * Design: docs/admin-store-order-ops-ssot.md §2 (amounts verified on all production orders).
 *
 * Amount definitions (never re-derived in the browser):
 * - unit price      = base_price_snapshot + options_unit_delta_snapshot  (= price_snapshot)
 * - line subtotal   = store_order_items.subtotal                          (= price × qty)
 * - order amount    = store_orders.total_amount                           (= Σ subtotal + delivery fee)
 * - coupon discount = discount_amount (= platform_funded_amount + store_funded_amount)
 * - gift certificate = gift_certificate_redemptions.redeemed_amount (ledger is authoritative;
 *   the order column `gift_redemption_amount` was not written by an older flow)
 * - customer paid   = payment_amount (= order amount − discount − gift)
 * - commission base = payment + gift + platform-funded (store_commission_charge_order_internal)
 * The only browser arithmetic is the integrity check, which compares and never replaces a value.
 */

export type AdminOrderItemOptionLine = { group: string; name: string; qty: number; unitDelta: number };

export type AdminOrderItem = {
  id: string;
  title: string;
  qty: number;
  basePrice: number | null;
  optionUnitDelta: number;
  unitPrice: number;
  subtotal: number;
  options: AdminOrderItemOptionLine[];
  /** Raw summary from the snapshot (shown when lines cannot be parsed). */
  optionSummary: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Parses `options_snapshot_json` v2 (`groups[].lines[]`). Unknown shapes keep only `summary`. */
export function parseOrderItemOptions(snapshot: unknown): { lines: AdminOrderItemOptionLine[]; summary: string | null } {
  if (!snapshot || typeof snapshot !== "object") return { lines: [], summary: null };
  const o = snapshot as Record<string, unknown>;
  const summary = typeof o.summary === "string" && o.summary.trim() ? o.summary.trim() : null;
  const lines: AdminOrderItemOptionLine[] = [];
  if (Array.isArray(o.groups)) {
    for (const g of o.groups as Record<string, unknown>[]) {
      const group = typeof g?.label === "string" ? g.label : "";
      if (!Array.isArray(g?.lines)) continue;
      for (const l of g.lines as Record<string, unknown>[]) {
        const name = typeof l?.name === "string" ? l.name : "";
        if (!name) continue;
        lines.push({ group, name, qty: Math.max(1, num(l.qty) || 1), unitDelta: num(l.price_delta_each) });
      }
    }
  }
  return { lines, summary };
}

export function mapAdminOrderItem(raw: Record<string, unknown>): AdminOrderItem {
  const { lines, summary } = parseOrderItemOptions(raw.options_snapshot_json);
  const base = raw.base_price_snapshot == null ? null : num(raw.base_price_snapshot);
  return {
    id: String(raw.id ?? ""),
    title: String(raw.product_title_snapshot ?? "") || "—",
    qty: num(raw.qty),
    basePrice: base,
    optionUnitDelta: num(raw.options_unit_delta_snapshot),
    unitPrice: num(raw.price_snapshot),
    subtotal: num(raw.subtotal),
    options: lines,
    optionSummary: summary,
  };
}

/**
 * Representative item (D4): the line with the largest subtotal (ties → title), "외 N개" where
 * N = the other line count. Item ids are random uuids, so "first line" is not an order.
 */
export function representativeItemLabel(
  first: string | null,
  lineCount: number,
  ko: boolean
): string {
  if (!first) return ko ? "상품 내역 없음" : "No items";
  const others = Math.max(0, lineCount - 1);
  if (others === 0) return first;
  return ko ? `${first} 외 ${others}개` : `${first} +${others} more`;
}

export type AdminOrderGiftLedger = {
  redeemed: number;
  reversed: boolean;
  forfeited: number;
  rows: number;
};

export type AdminOrderMoneyMismatch =
  | "gift_not_on_order"
  | "gift_not_deducted"
  | "gift_reversed_order_open"
  | "amount_mismatch";

export const ADMIN_ORDER_MONEY_MISMATCH_LABEL: Record<AdminOrderMoneyMismatch, { ko: string; en: string }> = {
  gift_not_on_order: { ko: "상품권 금액 주문 미기록 (사용 기록 기준 표시)", en: "Gift amount missing on order (redemption record shown)" },
  gift_not_deducted: { ko: "금액 기록 불일치 — 상품권 미차감", en: "Amount record mismatch — gift not deducted" },
  gift_reversed_order_open: {
    ko: "금액 기록 불일치 — 상품권 복원됨, 주문 진행 중",
    en: "Amount record mismatch — gift reversed while order is open",
  },
  amount_mismatch: { ko: "금액 불일치", en: "Amount mismatch" },
};

const CLOSED_ORDER_STATUSES = new Set(["completed", "cancelled", "refunded"]);

export type AdminOrderMoney = {
  orderAmount: number;
  deliveryFee: number;
  itemsTotal: number | null;
  couponDiscount: number;
  couponPlatformFunded: number;
  couponStoreFunded: number;
  couponTitle: string | null;
  giftAmount: number;
  giftSource: "ledger" | "order" | "none";
  giftReversed: boolean;
  customerPaid: number;
  commissionBase: number;
  /** Comparison only: order amount − discount − gift === customer paid. */
  consistent: boolean;
  mismatches: AdminOrderMoneyMismatch[];
};

export function buildAdminOrderMoney(
  order: Record<string, unknown>,
  items: AdminOrderItem[],
  gift: AdminOrderGiftLedger | null
): AdminOrderMoney {
  const orderAmount = num(order.total_amount);
  const discount = num(order.discount_amount);
  const paid = num(order.payment_amount);
  const giftColumn = num(order.gift_redemption_amount);
  const platformFunded = num(order.platform_funded_amount);
  const storeFunded = num(order.store_funded_amount);
  const ledgerGift = gift && gift.rows > 0 ? gift.redeemed : 0;
  const giftAmount = ledgerGift > 0 ? ledgerGift : giftColumn;
  const giftSource: AdminOrderMoney["giftSource"] = ledgerGift > 0 ? "ledger" : giftColumn > 0 ? "order" : "none";
  const consistent = orderAmount - discount - giftAmount === paid;

  const mismatches: AdminOrderMoneyMismatch[] = [];
  if (ledgerGift > 0 && giftColumn === 0) mismatches.push("gift_not_on_order");
  if (giftAmount > 0 && orderAmount - discount === paid) mismatches.push("gift_not_deducted");
  if (gift?.reversed && !CLOSED_ORDER_STATUSES.has(String(order.order_status ?? ""))) {
    mismatches.push("gift_reversed_order_open");
  }
  if (!consistent && !mismatches.includes("gift_not_deducted")) mismatches.push("amount_mismatch");

  return {
    orderAmount,
    deliveryFee: num(order.delivery_fee_amount),
    itemsTotal: items.length > 0 ? items.reduce((s, i) => s + i.subtotal, 0) : null,
    couponDiscount: discount,
    couponPlatformFunded: platformFunded,
    couponStoreFunded: storeFunded,
    couponTitle: typeof order.coupon_offer_title === "string" && order.coupon_offer_title ? order.coupon_offer_title : null,
    giftAmount,
    giftSource,
    giftReversed: gift?.reversed === true,
    customerPaid: paid,
    commissionBase: paid + giftColumn + platformFunded,
    consistent,
    mismatches,
  };
}

/** `store_orders.buyer_payment_method` — no PG integration (store_payments is empty). */
export const ADMIN_ORDER_PAYMENT_METHOD_MISSING = { ko: "결제수단 미기록", en: "Payment method not recorded" };

export type AdminOrderRequester = "buyer" | "owner" | "admin" | "system" | "unknown";

export const ADMIN_ORDER_REQUESTER_LABEL: Record<AdminOrderRequester, { ko: string; en: string }> = {
  buyer: { ko: "구매자", en: "Buyer" },
  owner: { ko: "매장", en: "Store" },
  admin: { ko: "관리자", en: "Admin" },
  system: { ko: "시스템", en: "System" },
  unknown: { ko: "기록 없음", en: "Not recorded" },
};

export function toRequester(v: unknown): AdminOrderRequester {
  const s = String(v ?? "").toLowerCase();
  if (s === "buyer" || s === "customer") return "buyer";
  if (s === "owner" || s === "store") return "owner";
  if (s === "admin") return "admin";
  if (s === "system") return "system";
  return "unknown";
}

export type AdminOrderCancelRequest = {
  id: string;
  requester: AdminOrderRequester;
  reason: string;
  status: string;
  previousStatus: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  rejectedReason: string | null;
};

export const ADMIN_CANCEL_REQUEST_STATUS_LABEL: Record<string, { ko: string; en: string }> = {
  pending: { ko: "매장 결정 대기", en: "Awaiting store" },
  approved: { ko: "승인 (취소됨)", en: "Approved" },
  rejected: { ko: "반려", en: "Rejected" },
  refunded: { ko: "환불 완료", en: "Refunded" },
  partial_refunded: { ko: "부분 환불", en: "Partially refunded" },
};

/** Detail modal sections (§5) — entry screens open their own section first. */
export const ADMIN_ORDER_DETAIL_SECTIONS = [
  "basic",
  "items",
  "payment",
  "delivery",
  "requests",
  "commission",
  "admin",
  "history",
] as const;
export type AdminOrderDetailSection = (typeof ADMIN_ORDER_DETAIL_SECTIONS)[number];

export function parseAdminOrderDetailSection(v: string | null | undefined): AdminOrderDetailSection | null {
  const s = String(v ?? "").trim();
  return (ADMIN_ORDER_DETAIL_SECTIONS as readonly string[]).includes(s) ? (s as AdminOrderDetailSection) : null;
}
