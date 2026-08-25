import {
  mapApiOrderToOwnerOrder,
  type ApiStoreOrderRow,
} from "@/lib/store-owner/map-api-order-to-owner";
import {
  mapRealtimeRecordToOwnerOrder,
  mergeRealtimeRecordIntoOwnerOrder,
} from "@/lib/store-owner/map-realtime-store-order-to-owner";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { BUYER_PUBLIC_LABEL_FALLBACK } from "@/lib/stores/buyer-public-label";

/** `OwnerStoreOrdersView` 목록 행 — API list/detail 응답과 동일 계열 */
export type OwnerStoreOrderListRow = {
  id: string;
  order_no: string;
  buyer_user_id: string;
  buyer_public_label?: string | null;
  buyer_phone?: string | null;
  total_amount: number;
  /** store_orders.discount_amount — checkout coupon snapshot, not recomputed */
  discount_amount?: number;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  created_at: string;
  updated_at?: string | null;
  auto_complete_at?: string | null;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
  accepted_at?: string | null;
  admin_locked?: boolean | null;
  admin_flagged?: boolean | null;
  dispute_status?: string | null;
  admin_note?: string | null;
  sla_warning_level?: string | null;
  sla_warning_reason?: string | null;
  sla_warning_at?: string | null;
  needs_admin_attention?: boolean | null;
  checkout_eta_minutes?: number | null;
  checkout_route_distance_meters?: number | null;
  review_status?: "not_applicable" | "pending" | "completed" | "unavailable" | string | null;
  /** `store_orders.community_messenger_room_id` — 배달 채팅(메신저) 방 */
  community_messenger_room_id?: string | null;
  delivery?: {
    order_id: string;
    rider_id: string | null;
    delivery_status: string;
    assigned_at: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
    rider_accepted_at?: string | null;
    customer_arrived_at?: string | null;
    rider_failure_reported_at?: string | null;
    rider_failure_report_reason?: string | null;
    updated_at: string | null;
    admin_note?: string | null;
  } | null;
  items: {
    id: string;
    product_id: string;
    product_title_snapshot: string;
    price_snapshot: number;
    qty: number;
    subtotal: number;
    options_snapshot_json?: unknown;
  }[];
};

export type OwnerStoreOrderListCtx = {
  storeId: string;
  storeSlug: string;
  storeName: string;
};

/** 목록·캐시·enrich 병합 후 `items` 누락 방지 — `OwnerOrderCard` 계약 */
export function normalizeOwnerStoreOrderListRow(
  row: OwnerStoreOrderListRow
): OwnerStoreOrderListRow {
  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export function normalizeOwnerStoreOrderListRows(
  rows: OwnerStoreOrderListRow[]
): OwnerStoreOrderListRow[] {
  return rows.map(normalizeOwnerStoreOrderListRow);
}

function coerceOwnerStoreOrderListItem(
  raw: unknown
): OwnerStoreOrderListRow["items"][number] | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    product_id: String(r.product_id ?? "").trim(),
    product_title_snapshot: String(r.product_title_snapshot ?? "").trim() || "품목",
    price_snapshot: Number(r.price_snapshot) || 0,
    qty: Math.max(1, Math.floor(Number(r.qty) || 1)),
    subtotal: Number(r.subtotal) || 0,
    options_snapshot_json: r.options_snapshot_json,
  };
}

/** GET …/orders·단건 enrich 응답 — `items` 항상 배열 */
export function parseOwnerStoreOrderListRowFromApi(raw: unknown): OwnerStoreOrderListRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  if (!id) return null;
  const items = (Array.isArray(r.items) ? r.items : [])
    .map(coerceOwnerStoreOrderListItem)
    .filter((x): x is OwnerStoreOrderListRow["items"][number] => x != null);
  const discountRaw = r.discount_amount;
  const discount_amount =
    discountRaw == null || discountRaw === ""
      ? undefined
      : Math.max(0, Math.round(Number(discountRaw) || 0));
  return normalizeOwnerStoreOrderListRow({
    ...(raw as OwnerStoreOrderListRow),
    id,
    items,
    ...(discount_amount != null ? { discount_amount } : {}),
  });
}

export function parseOwnerStoreOrdersListFromApiJson(json: unknown): OwnerStoreOrderListRow[] {
  if (typeof json !== "object" || json == null) return [];
  const orders = (json as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) return [];
  return orders
    .map(parseOwnerStoreOrderListRowFromApi)
    .filter((row): row is OwnerStoreOrderListRow => row != null);
}

export function sortOwnerStoreOrderListRowsDesc(
  list: OwnerStoreOrderListRow[]
): OwnerStoreOrderListRow[] {
  return [...list].sort((a, b) => {
    const aPending = a.order_status === "pending" ? 1 : 0;
    const bPending = b.order_status === "pending" ? 1 : 0;
    if (aPending !== bPending) return bPending - aPending;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function listRowToOwnerOrder(
  row: OwnerStoreOrderListRow,
  ctx: OwnerStoreOrderListCtx
): OwnerOrder {
  const o = mapApiOrderToOwnerOrder(row as ApiStoreOrderRow, ctx);
  const label =
    typeof row.buyer_public_label === "string" && row.buyer_public_label.trim()
      ? row.buyer_public_label.trim()
      : null;
  return {
    ...o,
    buyer_name: label ?? o.buyer_name,
    updated_at:
      typeof row.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at.trim()
        : o.updated_at,
  };
}

export function ownerOrderToListRow(
  o: OwnerOrder,
  prev?: OwnerStoreOrderListRow
): OwnerStoreOrderListRow {
  if (prev) {
    const [summary, detail] = splitDeliveryAddress(o.delivery_address);
    return {
      ...prev,
      items: Array.isArray(prev.items) ? prev.items : [],
      order_no: o.order_no,
      order_status: o.order_status,
      payment_status: o.payment_status ?? prev.payment_status,
      payment_amount: o.total_amount,
      total_amount: o.total_amount,
      fulfillment_type: fulfillmentFromOwnerOrder(o),
      buyer_note: o.request_message ?? prev.buyer_note,
      buyer_phone: o.buyer_phone !== "—" ? o.buyer_phone : prev.buyer_phone,
      delivery_address_summary: summary ?? prev.delivery_address_summary,
      delivery_address_detail: detail ?? prev.delivery_address_detail,
      buyer_payment_method: o.buyer_payment_method ?? prev.buyer_payment_method,
      buyer_payment_method_detail:
        o.buyer_payment_method_detail ?? prev.buyer_payment_method_detail,
      updated_at: o.updated_at,
      checkout_eta_minutes: o.checkout_eta_minutes ?? prev.checkout_eta_minutes,
      checkout_route_distance_meters:
        o.checkout_route_distance_meters ?? prev.checkout_route_distance_meters,
      community_messenger_room_id:
        o.community_messenger_room_id ?? prev.community_messenger_room_id,
      estimated_prep_minutes: prev.estimated_prep_minutes,
      estimated_ready_at: prev.estimated_ready_at,
      accepted_at: prev.accepted_at,
      review_status: prev.review_status,
      discount_amount: prev.discount_amount,
    };
  }

  const [summary, detail] = splitDeliveryAddress(o.delivery_address);
  return {
    id: o.id,
    order_no: o.order_no,
    buyer_user_id: "",
    buyer_public_label: o.buyer_name || BUYER_PUBLIC_LABEL_FALLBACK,
    buyer_phone: o.buyer_phone !== "—" ? o.buyer_phone : null,
    total_amount: o.total_amount,
    payment_amount: o.total_amount,
    payment_status: o.payment_status ?? "pending",
    order_status: o.order_status,
    fulfillment_type: fulfillmentFromOwnerOrder(o),
    buyer_note: o.request_message,
    buyer_payment_method: o.buyer_payment_method ?? null,
    buyer_payment_method_detail: o.buyer_payment_method_detail ?? null,
    delivery_address_summary: summary,
    delivery_address_detail: detail,
    created_at: o.created_at,
    updated_at: o.updated_at,
    auto_complete_at: null,
    estimated_prep_minutes: null,
    estimated_ready_at: null,
    accepted_at: null,
    admin_locked: null,
    admin_flagged: null,
    dispute_status: null,
    admin_note: null,
    sla_warning_level: null,
    sla_warning_reason: null,
    sla_warning_at: null,
    needs_admin_attention: null,
    checkout_eta_minutes: o.checkout_eta_minutes ?? null,
    checkout_route_distance_meters: o.checkout_route_distance_meters ?? null,
    delivery: null,
    items: [],
  };
}

export function ownerOrdersToListRows(
  prevRows: OwnerStoreOrderListRow[],
  nextOwner: OwnerOrder[]
): OwnerStoreOrderListRow[] {
  const prevById = new Map(prevRows.map((r) => [r.id, r]));
  return normalizeOwnerStoreOrderListRows(
    nextOwner.map((o) => ownerOrderToListRow(o, prevById.get(o.id)))
  );
}

export function mapRealtimeRecordToListRow(
  record: Record<string, unknown>,
  ctx: OwnerStoreOrderListCtx
): OwnerStoreOrderListRow | null {
  const o = mapRealtimeRecordToOwnerOrder(record, ctx);
  if (!o) return null;
  return normalizeOwnerStoreOrderListRow(ownerOrderToListRow(o));
}

export function mergeRealtimeRecordIntoListRow(
  prev: OwnerStoreOrderListRow,
  record: Record<string, unknown>,
  ctx: OwnerStoreOrderListCtx
): OwnerStoreOrderListRow {
  const asOwner = listRowToOwnerOrder(prev, ctx);
  const merged = mergeRealtimeRecordIntoOwnerOrder(asOwner, record);
  if (merged === asOwner) return prev;
  return normalizeOwnerStoreOrderListRow(ownerOrderToListRow(merged, prev));
}

function fulfillmentFromOwnerOrder(o: OwnerOrder): string {
  if (o.fulfillment_type) return o.fulfillment_type;
  if (o.order_type === "delivery") return "local_delivery";
  if (o.order_type === "shipping") return "shipping";
  return "pickup";
}

function splitDeliveryAddress(
  addr: string | null | undefined
): [string | null, string | null] {
  const t = typeof addr === "string" ? addr.trim() : "";
  if (!t) return [null, null];
  const parts = t.split("\n").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return [parts[0] ?? null, null];
  return [parts[0] ?? null, parts.slice(1).join("\n") || null];
}
