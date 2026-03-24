import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromPhDb09 } from "@/lib/utils/ph-mobile";
import type { OwnerOrder, OwnerOrderItem, OwnerOrderStatus, OwnerOrderType } from "./types";

type ApiOrderItem = {
  id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal: number;
  options_snapshot_json?: unknown;
};

export type ApiStoreOrderRow = {
  id: string;
  order_no: string;
  buyer_user_id: string;
  total_amount: number;
  payment_amount: number;
  delivery_fee_amount?: number | null;
  delivery_courier_label?: string | null;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  buyer_phone?: string | null;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  created_at: string;
  auto_complete_at?: string | null;
  items?: ApiOrderItem[];
};

function formatDeliveryAddressForOwner(
  summary: string | null | undefined,
  detail: string | null | undefined
): string | null {
  const s = (summary ?? "").trim();
  const d = (detail ?? "").trim();
  if (!s && !d) return null;
  if (s && d) return `${s}\n${d}`;
  return s || d;
}

function fulfillmentToOrderType(ft: string): OwnerOrderType {
  if (ft === "local_delivery") return "delivery";
  if (ft === "shipping") return "shipping";
  return "pickup";
}

function mapItems(items: ApiOrderItem[] | undefined): OwnerOrderItem[] {
  return (items ?? []).map((it) => ({
    id: it.id,
    menu_name: it.product_title_snapshot,
    options_summary: orderLineOptionsSummary(it.options_snapshot_json),
    qty: it.qty,
    line_total: Number(it.subtotal) || 0,
  }));
}

/** Supabase store_orders 행 → 오너 UI용 (구매자 실명은 프로필 미연동 시 플레이스홀더) */
export function mapApiOrderToOwnerOrder(
  row: ApiStoreOrderRow,
  ctx: { storeId: string; storeSlug: string; storeName: string }
): OwnerOrder {
  const items = mapItems(row.items);
  const product_amount = items.reduce((s, i) => s + i.line_total, 0);
  const delivery_fee = Math.max(0, Math.round(Number(row.delivery_fee_amount) || 0));
  const total = Number(row.payment_amount) || Number(row.total_amount) || product_amount + delivery_fee;

  const rawDigits = parsePhMobileInput(row.buyer_phone ?? "");
  const buyer_phone_tel_href = rawDigits.length === 11 ? telHrefFromPhDb09(rawDigits) : null;
  const buyer_phone =
    rawDigits.length === 11
      ? formatPhMobileDisplay(rawDigits)
      : row.buyer_phone?.trim()
        ? row.buyer_phone.trim()
        : "—";

  return {
    id: row.id,
    order_no: row.order_no,
    store_id: ctx.storeId,
    store_slug: ctx.storeSlug,
    store_name: ctx.storeName,
    buyer_name: "구매 회원",
    buyer_phone,
    buyer_phone_tel_href,
    order_type: fulfillmentToOrderType(String(row.fulfillment_type ?? "pickup")),
    order_status: row.order_status as OwnerOrderStatus,
    product_amount,
    option_amount: 0,
    delivery_fee,
    total_amount: total,
    delivery_courier_label: row.delivery_courier_label?.trim() || null,
    request_message: row.buyer_note,
    delivery_address: formatDeliveryAddressForOwner(
      row.delivery_address_summary,
      row.delivery_address_detail
    ),
    pickup_note: null,
    created_at: row.created_at,
    updated_at: row.created_at,
    items,
    logs: [],
    buyer_cancel_request: null,
    problem_memo: null,
    cancel_reason: null,
    payment_status: row.payment_status,
    buyer_payment_method: row.buyer_payment_method?.trim() || null,
    buyer_payment_method_detail: row.buyer_payment_method_detail?.trim() || null,
    fulfillment_type: String(row.fulfillment_type ?? "pickup"),
  };
}
