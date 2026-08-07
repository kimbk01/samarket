import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedStoreOrderLine } from "@/lib/stores/validate-store-order-checkout";

export type CreateStoreOrderAtomicLineInput = ValidatedStoreOrderLine & {
  /** validate 시점 options_json — TX 내 변경 시 price_changed */
  expected_options_json: unknown;
};

export type CreateStoreOrderAtomicOrderPayload = {
  order_no: string;
  total_amount: number;
  discount_amount: number;
  payment_amount: number;
  delivery_fee_amount: number;
  delivery_courier_label?: string | null;
  payment_status: string;
  fulfillment_type: string;
  buyer_note?: string | null;
  buyer_phone?: string | null;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  delivery_region?: string | null;
  delivery_city?: string | null;
  delivery_place_id?: string | null;
  delivery_formatted_address?: string | null;
  delivery_detail_address?: string | null;
  delivery_note?: string | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  delivery_user_address_id?: string | null;
  checkout_prep_minutes?: number | null;
  checkout_ride_minutes?: number | null;
  checkout_eta_minutes?: number | null;
  checkout_eta_computed_at?: string | null;
  checkout_route_distance_meters?: number | null;
  checkout_straight_distance_meters?: number | null;
};

export type CreateStoreOrderAtomicOk = {
  ok: true;
  idempotent: boolean;
  order: { id: string; order_no: string; payment_amount: number };
  soldOutProducts: { productId: string; productTitle: string }[];
  orderCreatedEventId: string | null;
  storeName: string | null;
  ownerUserId: string | null;
};

export type CreateStoreOrderAtomicErr = {
  ok: false;
  error: string;
  httpStatus: number;
};

export type CreateStoreOrderAtomicResult = CreateStoreOrderAtomicOk | CreateStoreOrderAtomicErr;

function isMissingRpc(message: string): boolean {
  return (
    /create_store_order_atomic/i.test(message) &&
    (/does not exist|Could not find the function/i.test(message) || /schema cache/i.test(message))
  );
}

/**
 * Phase 5 — stock + order + items + options + order_created 를 단일 DB TX(RPC)로 생성.
 */
export async function createStoreOrderAtomic(
  sb: SupabaseClient,
  opts: {
    buyerUserId: string;
    storeId: string;
    clientOrderKey: string | null;
    order: CreateStoreOrderAtomicOrderPayload;
    lines: CreateStoreOrderAtomicLineInput[];
  }
): Promise<CreateStoreOrderAtomicResult> {
  const linesPayload = opts.lines.map((line) => ({
    product_id: line.product_id,
    qty: line.qty,
    title: line.title,
    unit: line.unit,
    subtotal: line.subtotal,
    options_snapshot: line.options_snapshot,
    base_unit_after_discount: line.base_unit_after_discount,
    unit_options_delta: line.unit_options_delta,
    expected_options_json: line.expected_options_json ?? null,
  }));

  const { data, error } = await sb.rpc("create_store_order_atomic", {
    p_buyer_user_id: opts.buyerUserId,
    p_store_id: opts.storeId,
    p_client_order_key: opts.clientOrderKey,
    p_order: opts.order,
    p_lines: linesPayload,
  });

  if (error) {
    if (isMissingRpc(error.message)) {
      return { ok: false, error: "create_store_order_atomic_missing", httpStatus: 503 };
    }
    console.error("[createStoreOrderAtomic]", error);
    return { ok: false, error: error.message, httpStatus: 500 };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return {
      ok: false,
      error: String(row.error ?? "create_failed"),
      httpStatus: Math.max(400, Math.floor(Number(row.http_status) || 400)),
    };
  }

  const orderObj = (row.order ?? {}) as Record<string, unknown>;
  const soldRaw = Array.isArray(row.sold_out_products) ? row.sold_out_products : [];
  const soldOutProducts = soldRaw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const productId = String(o.productId ?? o.product_id ?? "").trim();
      if (!productId) return null;
      return {
        productId,
        productTitle: String(o.productTitle ?? o.product_title ?? "").trim(),
      };
    })
    .filter((x): x is { productId: string; productTitle: string } => !!x);

  return {
    ok: true,
    idempotent: row.idempotent === true,
    order: {
      id: String(orderObj.id ?? ""),
      order_no: String(orderObj.order_no ?? ""),
      payment_amount: Number(orderObj.payment_amount ?? 0),
    },
    soldOutProducts,
    orderCreatedEventId: row.order_created_event_id
      ? String(row.order_created_event_id)
      : null,
    storeName: row.store_name != null ? String(row.store_name) : null,
    ownerUserId: row.owner_user_id != null ? String(row.owner_user_id) : null,
  };
}
