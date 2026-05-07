import { mapApiOrderToOwnerOrder, type ApiStoreOrderRow } from "./map-api-order-to-owner";
import type { OwnerOrder, OwnerOrderStatus } from "./types";

const OWNER_STATUSES = new Set<string>([
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "cancel_requested",
  "cancelled",
  "refund_requested",
  "refunded",
]);

function asOwnerStatus(raw: unknown): OwnerOrderStatus | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || !OWNER_STATUSES.has(s)) return null;
  return s as OwnerOrderStatus;
}

/** Supabase Realtime `postgres_changes` payload.new — snake_case 컬럼 */
export function realtimeRecordToApiRow(record: Record<string, unknown>): ApiStoreOrderRow | null {
  const id = String(record.id ?? "").trim();
  if (!id) return null;
  const order_no = String(record.order_no ?? "").trim();
  const buyer_user_id = String(record.buyer_user_id ?? "").trim();
  return {
    id,
    order_no,
    buyer_user_id,
    total_amount: Number(record.total_amount) || 0,
    payment_amount: Number(record.payment_amount) || 0,
    delivery_fee_amount:
      record.delivery_fee_amount != null ? Number(record.delivery_fee_amount) : null,
    delivery_courier_label:
      typeof record.delivery_courier_label === "string" ? record.delivery_courier_label : null,
    payment_status: String(record.payment_status ?? ""),
    order_status: String(record.order_status ?? "pending"),
    fulfillment_type: String(record.fulfillment_type ?? "pickup"),
    buyer_note: typeof record.buyer_note === "string" ? record.buyer_note : null,
    buyer_phone: typeof record.buyer_phone === "string" ? record.buyer_phone : null,
    buyer_payment_method:
      typeof record.buyer_payment_method === "string" ? record.buyer_payment_method : null,
    buyer_payment_method_detail:
      typeof record.buyer_payment_method_detail === "string"
        ? record.buyer_payment_method_detail
        : null,
    delivery_address_summary:
      typeof record.delivery_address_summary === "string"
        ? record.delivery_address_summary
        : null,
    delivery_address_detail:
      typeof record.delivery_address_detail === "string" ? record.delivery_address_detail : null,
    created_at: String(record.created_at ?? new Date().toISOString()),
    auto_complete_at:
      typeof record.auto_complete_at === "string" ? record.auto_complete_at : null,
    community_messenger_room_id:
      typeof record.community_messenger_room_id === "string"
        ? record.community_messenger_room_id
        : null,
    items: undefined,
  };
}

export function mapRealtimeRecordToOwnerOrder(
  record: Record<string, unknown>,
  ctx: { storeId: string; storeSlug: string; storeName: string }
): OwnerOrder | null {
  const api = realtimeRecordToApiRow(record);
  if (!api) return null;
  const o = mapApiOrderToOwnerOrder(api, ctx);
  const ut =
    record.updated_at != null && String(record.updated_at).trim()
      ? String(record.updated_at).trim()
      : o.updated_at;
  return { ...o, updated_at: ut };
}

/**
 * UPDATE 페이로드를 기존 행에 합친다. 변경 없으면 동일 참조 반환.
 */
export function mergeRealtimeRecordIntoOwnerOrder(
  prev: OwnerOrder,
  record: Record<string, unknown>
): OwnerOrder {
  const nu =
    record.updated_at != null ? String(record.updated_at).trim() : "";

  const next: OwnerOrder = { ...prev };
  let changed = false;

  const st = asOwnerStatus(record.order_status);
  if (st != null && st !== prev.order_status) {
    next.order_status = st;
    changed = true;
  }

  const ps = record.payment_status != null ? String(record.payment_status).trim() : "";
  if (ps && ps !== (prev.payment_status ?? "")) {
    next.payment_status = ps;
    changed = true;
  }

  const pa = record.payment_amount != null ? Number(record.payment_amount) : null;
  if (pa != null && Number.isFinite(pa)) {
    const r = Math.round(pa);
    if (r !== prev.total_amount) {
      next.total_amount = r;
      changed = true;
    }
  }

  const ta = record.total_amount != null ? Number(record.total_amount) : null;
  if (ta != null && Number.isFinite(ta)) {
    const rounded = Math.round(ta);
    if (rounded !== prev.total_amount) {
      next.total_amount = rounded;
      changed = true;
    }
  }

  const df = record.delivery_fee_amount != null ? Number(record.delivery_fee_amount) : null;
  if (df != null && Number.isFinite(df) && Math.round(df) !== prev.delivery_fee) {
    next.delivery_fee = Math.max(0, Math.round(df));
    changed = true;
  }

  const bn = record.buyer_note != null ? String(record.buyer_note) : null;
  if (bn !== null && bn !== (prev.request_message ?? "")) {
    next.request_message = bn || null;
    changed = true;
  }

  const das =
    record.delivery_address_summary != null ? String(record.delivery_address_summary) : null;
  const dad =
    record.delivery_address_detail != null ? String(record.delivery_address_detail) : null;
  if (das != null || dad != null) {
    const s = (das ?? "").trim();
    const d = (dad ?? "").trim();
    const formatted =
      s && d ? `${s}\n${d}` : s || d || null;
    if (formatted !== prev.delivery_address) {
      next.delivery_address = formatted;
      changed = true;
    }
  }

  const ft = record.fulfillment_type != null ? String(record.fulfillment_type).trim() : "";
  if (ft && ft !== (prev.fulfillment_type ?? "")) {
    next.fulfillment_type = ft;
    if (ft === "local_delivery") next.order_type = "delivery";
    else if (ft === "shipping") next.order_type = "shipping";
    else next.order_type = "pickup";
    changed = true;
  }

  const room =
    record.community_messenger_room_id != null
      ? String(record.community_messenger_room_id).trim()
      : "";
  if (room && room !== (prev.community_messenger_room_id ?? "")) {
    next.community_messenger_room_id = room;
    changed = true;
  }

  const dcl =
    record.delivery_courier_label != null ? String(record.delivery_courier_label).trim() : "";
  if (dcl !== (prev.delivery_courier_label ?? "") && (dcl || prev.delivery_courier_label)) {
    next.delivery_courier_label = dcl || null;
    changed = true;
  }

  if (nu && nu !== prev.updated_at) {
    next.updated_at = nu;
    changed = true;
  }

  return changed ? next : prev;
}
