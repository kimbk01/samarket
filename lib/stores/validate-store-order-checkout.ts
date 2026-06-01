import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import {
  computeCartLineMergeKey,
  parseProductOptionsJson,
  validateLineModifiers,
  type OrderLineOptionsSnapshotV2,
} from "@/lib/stores/product-line-options";
import {
  parseCommerceExtrasFromHoursJson,
  resolveChargedDeliveryFeePhp,
} from "@/lib/stores/store-commerce-extras";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { isStorePointCommerceBlocked } from "@/lib/stores/store-point-commerce-block";
import { canOwnerSellProducts } from "@/lib/stores/owner-product-gate";

export type StoreOrderLineInput = {
  product_id: string;
  qty: number;
  wire: ModifierSelectionsWire;
  line_note: string | null;
  /** 장바구니 스냅샷 단가 — 불일치 시 price_changed */
  client_unit_php?: number | null;
};

export type ValidatedStoreOrderLine = {
  product_id: string;
  title: string;
  unit: number;
  qty: number;
  subtotal: number;
  options_snapshot: OrderLineOptionsSnapshotV2;
  base_unit_after_discount: number;
  unit_options_delta: number;
};

export type ValidateStoreOrderCheckoutResult =
  | {
      ok: true;
      lines: ValidatedStoreOrderLine[];
      paymentTotal: number;
      deliveryFeeAmount: number;
      paymentGrandTotal: number;
      /** 검증 시 조회한 상품 — 재고 차감 재조회 생략 */
      productsById: Record<string, StoreOrderCheckoutProductRow>;
    }
  | { ok: false; error: string; status: number; min_order_php?: number };

type StoreRow = {
  id: string;
  owner_user_id: string;
  approval_status: string;
  is_visible: boolean;
  is_open: boolean | null;
  point_commerce_blocked?: boolean | null;
  business_hours_json: unknown;
  pickup_available?: boolean | null;
  delivery_available?: boolean | null;
};

export type StoreOrderCheckoutProductRow = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  discount_price: number | null;
  stock_qty: number;
  track_inventory?: boolean;
  product_status: string;
  min_order_qty: number;
  max_order_qty: number;
  pickup_available: boolean;
  local_delivery_available: boolean;
  shipping_available: boolean;
  options_json: unknown;
};

export function assertSingleStoreOnOrderItems(
  storeId: string,
  products: Pick<StoreOrderCheckoutProductRow, "id" | "store_id">[]
): { ok: true } | { ok: false; error: "mixed_store_cart" } {
  const sid = storeId.trim();
  const storeIds = new Set(
    products.map((p) => String(p.store_id ?? "").trim()).filter(Boolean)
  );
  if (storeIds.size > 1) {
    return { ok: false, error: "mixed_store_cart" };
  }
  if (storeIds.size === 1 && !storeIds.has(sid)) {
    return { ok: false, error: "mixed_store_cart" };
  }
  return { ok: true };
}

function productUnitPrice(p: StoreOrderCheckoutProductRow): number {
  const price = Number(p.price);
  const disc = p.discount_price != null ? Number(p.discount_price) : null;
  return disc != null && Number.isFinite(disc) && disc >= 0 && disc < price ? disc : price;
}

/**
 * POST /api/me/store-orders — 단일 store_id·상품·옵션·가격·최소주문(할인 후 상품합) 서버 최종 검증.
 */
export async function validateStoreOrderCheckout(params: {
  sb: SupabaseClient;
  buyerId: string;
  storeId: string;
  fulfillment: "pickup" | "local_delivery" | "shipping";
  items: StoreOrderLineInput[];
  store?: StoreRow | null;
}): Promise<ValidateStoreOrderCheckoutResult> {
  const { sb, storeId, fulfillment, items } = params;
  if (!storeId || items.length === 0) {
    return { ok: false, error: "store_and_items_required", status: 400 };
  }

  const lineKeys = items.map((x) =>
    computeCartLineMergeKey({
      storeId,
      productId: x.product_id,
      selections: x.wire,
      lineNote: x.line_note,
    })
  );
  if (new Set(lineKeys).size !== lineKeys.length) {
    return { ok: false, error: "duplicate_line_in_order", status: 400 };
  }

  let storeRow = params.store ?? null;
  if (!storeRow) {
    const { data: store, error: sErr } = await sb
      .from("stores")
      .select(
        "id, owner_user_id, approval_status, is_visible, is_open, point_commerce_blocked, business_hours_json, pickup_available, delivery_available"
      )
      .eq("id", storeId)
      .maybeSingle();

    if (sErr || !store) {
      return { ok: false, error: "store_unavailable", status: 400 };
    }
    storeRow = store as StoreRow;
  }

  if (storeRow.approval_status !== "approved" || !storeRow.is_visible) {
    return { ok: false, error: "store_unavailable", status: 400 };
  }

  if (!(await canOwnerSellProducts(sb, storeId))) {
    return { ok: false, error: "store_not_selling", status: 400 };
  }

  if (!resolveStoreFrontOpen(storeRow.business_hours_json, storeRow.is_open)) {
    return { ok: false, error: "store_closed", status: 400 };
  }

  if (isStorePointCommerceBlocked(storeRow)) {
    return { ok: false, error: "store_point_blocked", status: 400 };
  }

  const storePickupOff = storeRow.pickup_available === false;
  const storeDeliveryOn = storeRow.delivery_available === true;

  if (fulfillment === "pickup" && storePickupOff) {
    return { ok: false, error: "store_pickup_disabled", status: 400 };
  }
  if (fulfillment === "local_delivery" && !storeDeliveryOn) {
    return { ok: false, error: "store_delivery_disabled", status: 400 };
  }

  const productIds = items.map((x) => x.product_id);
  const { data: products, error: pErr } = await sb
    .from("store_products")
    .select(
      "id, store_id, title, price, discount_price, stock_qty, track_inventory, product_status, min_order_qty, max_order_qty, pickup_available, local_delivery_available, shipping_available, options_json"
    )
    .in("id", productIds);

  if (pErr || !products?.length || products.length !== productIds.length) {
    return { ok: false, error: "products_not_found", status: 400 };
  }

  const productRows = products as StoreOrderCheckoutProductRow[];
  const mixed = assertSingleStoreOnOrderItems(storeId, productRows);
  if (!mixed.ok) {
    return { ok: false, error: mixed.error, status: 400 };
  }

  const byId = Object.fromEntries(productRows.map((p) => [p.id, p]));
  let paymentTotal = 0;
  const lines: ValidatedStoreOrderLine[] = [];

  for (const line of items) {
    const p = byId[line.product_id];
    if (!p || p.store_id !== storeId) {
      return { ok: false, error: "invalid_product", status: 400 };
    }
    if (p.product_status === "sold_out") {
      return { ok: false, error: "product_sold_out", status: 400 };
    }
    if (p.product_status !== "active") {
      return { ok: false, error: "product_not_available", status: 400 };
    }

    const minQ = Math.max(1, Number(p.min_order_qty) || 1);
    const maxQ = Math.max(minQ, Number(p.max_order_qty) || 99);
    if (line.qty < minQ || line.qty > maxQ) {
      return { ok: false, error: "qty_out_of_range", status: 400 };
    }

    const trackStock = p.track_inventory === true;
    if (trackStock && line.qty > Number(p.stock_qty)) {
      return { ok: false, error: "insufficient_stock", status: 400 };
    }

    if (fulfillment === "pickup" && !p.pickup_available) {
      return { ok: false, error: "pickup_not_available", status: 400 };
    }
    if (fulfillment === "local_delivery" && !p.local_delivery_available && !storeDeliveryOn) {
      return { ok: false, error: "delivery_not_available", status: 400 };
    }
    if (fulfillment === "shipping" && !p.shipping_available) {
      return { ok: false, error: "shipping_not_available", status: 400 };
    }

    const baseUnit = productUnitPrice(p);
    const groups = parseProductOptionsJson(p.options_json);
    const optVal = validateLineModifiers(groups, line.wire, baseUnit);
    if (!optVal.ok) {
      const err = optVal.error ?? "invalid_option";
      return { ok: false, error: err, status: 400 };
    }

    const unit = baseUnit + optVal.unitDelta;
    if (!Number.isFinite(unit) || unit < 0) {
      return { ok: false, error: "invalid_unit_price", status: 400 };
    }

    if (line.client_unit_php == null || !Number.isFinite(line.client_unit_php)) {
      return { ok: false, error: "client_unit_php_required", status: 400 };
    }
    if (Math.abs(unit - line.client_unit_php) >= 1) {
      return { ok: false, error: "price_changed", status: 400 };
    }

    const subtotal = unit * line.qty;
    paymentTotal += subtotal;
    const options_snapshot: OrderLineOptionsSnapshotV2 =
      line.line_note != null && line.line_note.length > 0
        ? { ...optVal.snapshot, line_note: line.line_note }
        : optVal.snapshot;

    lines.push({
      product_id: line.product_id,
      title: String(p.title),
      unit,
      qty: line.qty,
      subtotal,
      options_snapshot,
      base_unit_after_discount: options_snapshot.base_unit_after_discount,
      unit_options_delta: options_snapshot.unit_options_delta,
    });
  }

  const commerceExtras = parseCommerceExtrasFromHoursJson(storeRow.business_hours_json);
  const minOrderPhp = commerceExtras.minOrderPhp;
  if (minOrderPhp != null && minOrderPhp > 0 && paymentTotal < minOrderPhp) {
    return { ok: false, error: "below_min_order", status: 400, min_order_php: minOrderPhp };
  }

  const deliveryFeeAmount = resolveChargedDeliveryFeePhp(commerceExtras, paymentTotal, fulfillment);
  const paymentGrandTotal = paymentTotal + deliveryFeeAmount;

  return {
    ok: true,
    lines,
    paymentTotal,
    deliveryFeeAmount,
    paymentGrandTotal,
    productsById: byId,
  };
}
