import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { notifyStoreOwnerNewOrder } from "@/lib/notifications/notify-store-commerce";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { canOwnerSellProducts } from "@/lib/stores/owner-product-gate";
import {
  orderLineIdentityKey,
  parseProductOptionsJson,
  type OrderLineOptionsSnapshotV1,
  validateLineOptionSelections,
} from "@/lib/stores/product-line-options";
import { normalizePhMobileDb } from "@/lib/utils/ph-mobile";
import {
  effectiveCheckoutPaymentMethodIdsForCart,
  formatBuyerPaymentDisplay,
  isKnownCheckoutPaymentMethodId,
  readPaymentMethodsFormValues,
  type OrderCheckoutPaymentId,
} from "@/lib/stores/payment-methods-config";
import {
  parseCommerceExtrasFromHoursJson,
  resolveChargedDeliveryFeePhp,
} from "@/lib/stores/store-commerce-extras";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { ensureStoreOrderChatRoom } from "@/lib/chat/store-order-chat-db";

export const dynamic = "force-dynamic";

async function restoreDecrementedStock(
  sb: SupabaseClient,
  rollback: { id: string; delta: number }[]
) {
  for (const r of rollback) {
    const { data: cur } = await sb
      .from("store_products")
      .select("stock_qty, product_status")
      .eq("id", r.id)
      .maybeSingle();
    if (cur) {
      const n = (cur.stock_qty as number) + r.delta;
      await sb
        .from("store_products")
        .update({
          stock_qty: n,
          product_status: n > 0 && cur.product_status === "sold_out" ? "active" : cur.product_status,
        })
        .eq("id", r.id);
    }
  }
}

function makeOrderNo() {
  return `SO${Date.now()}${randomBytes(2).toString("hex")}`;
}

type LineInput = {
  product_id: string;
  qty: number;
  /** 그룹 key(보통 "0","1",…) → 선택한 옵션명 배열 */
  option_selections?: Record<string, string[]>;
};

function normalizeOrderLineItem(raw: unknown): { product_id: string; qty: number; option_selections: Record<string, string[]> } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const product_id = String(r.product_id ?? "").trim();
  const qty = Math.floor(Number(r.qty));
  if (!product_id || !Number.isFinite(qty) || qty < 1) return null;
  const option_selections: Record<string, string[]> = {};
  const os = r.option_selections;
  if (os != null && typeof os === "object" && !Array.isArray(os)) {
    for (const [k, v] of Object.entries(os as Record<string, unknown>)) {
      const key = String(k).trim();
      if (!key) continue;
      if (Array.isArray(v)) {
        option_selections[key] = v.map((x) => String(x).trim()).filter(Boolean);
      } else if (typeof v === "string" && v.trim()) {
        option_selections[key] = [v.trim()];
      }
    }
  }
  return { product_id, qty, option_selections };
}

/** 구매자: 매장 주문 목록 */
export async function GET() {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: orders, error } = await sb
    .from("store_orders")
    .select(
      "id, order_no, store_id, total_amount, payment_amount, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, created_at, auto_complete_at"
    )
    .eq("buyer_user_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[GET store-orders]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = orders ?? [];
  const storeIds = [...new Set(list.map((o) => o.store_id as string))];
  const names: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) names[s.id as string] = (s.store_name as string) ?? "";
  }

  const orderIds = list.map((o) => o.id as string);
  const itemsByOrder: Record<string, unknown[]> = {};
  if (orderIds.length) {
    const { data: itemRows, error: iErr } = await sb
      .from("store_order_items")
      .select("id, order_id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
      .in("order_id", orderIds);
    if (iErr) {
      console.error("[GET store-orders items]", iErr);
      return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
    }
    for (const row of itemRows ?? []) {
      const oid = row.order_id as string;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(row);
    }
  }

  return NextResponse.json({
    ok: true,
    orders: list.map((o) => {
      const id = o.id as string;
      return {
        ...o,
        store_name: names[o.store_id as string] ?? "",
        items: itemsByOrder[id] ?? [],
      };
    }),
  });
}

type PostBody = {
  store_id?: string;
  items?: LineInput[];
  fulfillment_type?: string;
  buyer_note?: string;
  buyer_phone?: string;
  /** 고객 선택 결제 수단: cod | gcash | bank_transfer | other | card_on_delivery */
  payment_method?: string;
  /** 배달·택배 수령지 한 줄 */
  delivery_address_summary?: string;
  delivery_address_detail?: string;
};

/**
 * 주문 생성 — 앱 내 결제 없음. payment_status=paid 는 주문 금액 확정(정산·크론 호환)용입니다.
 * - 재고 차감 후 주문 저장; 주문 실패 시 재고 복구 시도
 */
export async function POST(req: NextRequest) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const storeId = String(body.store_id ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!storeId || items.length === 0) {
    return NextResponse.json({ ok: false, error: "store_and_items_required" }, { status: 400 });
  }

  const fulfillmentRaw = String(body.fulfillment_type ?? "pickup").trim();
  const fulfillment =
    fulfillmentRaw === "local_delivery" || fulfillmentRaw === "shipping"
      ? fulfillmentRaw
      : "pickup";

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select(
      "id, owner_user_id, approval_status, is_visible, store_name, is_open, business_hours_json, pickup_available, delivery_available"
    )
    .eq("id", storeId)
    .maybeSingle();

  if (sErr || !store || store.approval_status !== "approved" || !store.is_visible) {
    return NextResponse.json({ ok: false, error: "store_unavailable" }, { status: 400 });
  }

  if (store.owner_user_id === buyerId) {
    return NextResponse.json({ ok: false, error: "cannot_order_own_store" }, { status: 400 });
  }

  if (!(await canOwnerSellProducts(sb, storeId))) {
    return NextResponse.json({ ok: false, error: "store_not_selling" }, { status: 400 });
  }

  if (!resolveStoreFrontOpen(store.business_hours_json, store.is_open)) {
    return NextResponse.json({ ok: false, error: "store_closed" }, { status: 400 });
  }

  const storePickupOff = (store as { pickup_available?: boolean }).pickup_available === false;
  const storeDeliveryOn = (store as { delivery_available?: boolean }).delivery_available === true;

  if (fulfillment === "pickup" && storePickupOff) {
    return NextResponse.json({ ok: false, error: "store_pickup_disabled" }, { status: 400 });
  }
  if (fulfillment === "local_delivery" && !storeDeliveryOn) {
    return NextResponse.json({ ok: false, error: "store_delivery_disabled" }, { status: 400 });
  }

  const normalized: { product_id: string; qty: number; option_selections: Record<string, string[]> }[] = [];
  for (const raw of items) {
    const row = normalizeOrderLineItem(raw);
    if (!row) {
      return NextResponse.json({ ok: false, error: "invalid_line" }, { status: 400 });
    }
    normalized.push(row);
  }

  const lineKeys = normalized.map((x) => orderLineIdentityKey(x.product_id, x.option_selections));
  if (new Set(lineKeys).size !== lineKeys.length) {
    return NextResponse.json({ ok: false, error: "duplicate_line_in_order" }, { status: 400 });
  }

  const productIds = normalized.map((x) => x.product_id);
  const { data: products, error: pErr } = await sb
    .from("store_products")
    .select(
      "id, store_id, title, price, discount_price, stock_qty, track_inventory, product_status, min_order_qty, max_order_qty, pickup_available, local_delivery_available, shipping_available, options_json"
    )
    .in("id", productIds);

  if (pErr || !products?.length || products.length !== productIds.length) {
    return NextResponse.json({ ok: false, error: "products_not_found" }, { status: 400 });
  }

  const byId = Object.fromEntries(products.map((p) => [p.id as string, p]));
  let paymentTotal = 0;
  const lines: {
    product_id: string;
    title: string;
    unit: number;
    qty: number;
    subtotal: number;
    options_snapshot: OrderLineOptionsSnapshotV1;
  }[] = [];

  for (const line of normalized) {
    const p = byId[line.product_id];
    if (!p || p.store_id !== storeId || p.product_status !== "active") {
      return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
    }
    const minQ = Math.max(1, Number(p.min_order_qty) || 1);
    const maxQ = Math.max(minQ, Number(p.max_order_qty) || 99);
    if (line.qty < minQ || line.qty > maxQ) {
      return NextResponse.json({ ok: false, error: "qty_out_of_range" }, { status: 400 });
    }
    const trackStock = (p as { track_inventory?: boolean }).track_inventory === true;
    if (trackStock && line.qty > (p.stock_qty as number)) {
      return NextResponse.json({ ok: false, error: "insufficient_stock" }, { status: 400 });
    }
    if (fulfillment === "pickup" && !p.pickup_available) {
      return NextResponse.json({ ok: false, error: "pickup_not_available" }, { status: 400 });
    }
    /** 매장 배달이 켜져 있으면 상품별 local_delivery 미체크(기본 false)도 허용 */
    if (
      fulfillment === "local_delivery" &&
      !p.local_delivery_available &&
      !storeDeliveryOn
    ) {
      return NextResponse.json({ ok: false, error: "delivery_not_available" }, { status: 400 });
    }
    if (fulfillment === "shipping" && !p.shipping_available) {
      return NextResponse.json({ ok: false, error: "shipping_not_available" }, { status: 400 });
    }
    const groups = parseProductOptionsJson(p.options_json);
    const optVal = validateLineOptionSelections(groups, line.option_selections);
    if (!optVal.ok) {
      return NextResponse.json({ ok: false, error: optVal.error }, { status: 400 });
    }
    const price = Number(p.price);
    const disc = p.discount_price != null ? Number(p.discount_price) : null;
    const baseUnit =
      disc != null && Number.isFinite(disc) && disc >= 0 && disc < price ? disc : price;
    const unit = baseUnit + optVal.unitDelta;
    if (!Number.isFinite(unit) || unit < 0) {
      return NextResponse.json({ ok: false, error: "invalid_unit_price" }, { status: 400 });
    }
    const subtotal = unit * line.qty;
    paymentTotal += subtotal;
    lines.push({
      product_id: line.product_id,
      title: String(p.title),
      unit,
      qty: line.qty,
      subtotal,
      options_snapshot: optVal.snapshot,
    });
  }

  const commerceExtras = parseCommerceExtrasFromHoursJson(store.business_hours_json);
  const minOrderPhp = commerceExtras.minOrderPhp;
  if (minOrderPhp != null && minOrderPhp > 0 && paymentTotal < minOrderPhp) {
    return NextResponse.json(
      { ok: false, error: "below_min_order", min_order_php: minOrderPhp },
      { status: 400 }
    );
  }

  const deliveryFeeAmount = resolveChargedDeliveryFeePhp(commerceExtras, paymentTotal, fulfillment);
  const deliveryCourierLabel =
    fulfillment === "local_delivery" && commerceExtras.deliveryCourierLabel?.trim()
      ? commerceExtras.deliveryCourierLabel.trim()
      : null;
  const paymentGrandTotal = paymentTotal + deliveryFeeAmount;

  const allowedPaymentMethods = effectiveCheckoutPaymentMethodIdsForCart(
    store.business_hours_json
  );
  const paymentMethodRaw = String(body.payment_method ?? "").trim();
  if (!paymentMethodRaw) {
    return NextResponse.json(
      {
        ok: false,
        error: "payment_method_required",
        message: "결제 방법을 선택해 주세요.",
      },
      { status: 400 }
    );
  }
  if (
    !isKnownCheckoutPaymentMethodId(paymentMethodRaw) ||
    !allowedPaymentMethods.includes(paymentMethodRaw as OrderCheckoutPaymentId)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "payment_method_invalid",
        message: "선택한 결제 방법을 이 매장에서 사용할 수 없습니다.",
      },
      { status: 400 }
    );
  }

  const payCfgAtOrder = readPaymentMethodsFormValues(store.business_hours_json);
  const buyer_payment_method_detail =
    paymentMethodRaw === "other"
      ? payCfgAtOrder.payMethodOtherText.trim() || "기타"
      : null;

  const stockRollback: { id: string; delta: number }[] = [];

  for (const line of lines) {
    const p = byId[line.product_id];
    const trackStock = (p as { track_inventory?: boolean }).track_inventory === true;
    if (!trackStock) continue;
    const prev = p.stock_qty as number;
    const next = prev - line.qty;
    const { error: uErr } = await sb
      .from("store_products")
      .update({ stock_qty: next, product_status: next <= 0 ? "sold_out" : p.product_status })
      .eq("id", line.product_id)
      .eq("stock_qty", prev);

    if (uErr) {
      await restoreDecrementedStock(sb, stockRollback);
      return NextResponse.json({ ok: false, error: "stock_update_failed" }, { status: 409 });
    }
    stockRollback.push({ id: line.product_id, delta: line.qty });
  }

  const orderNo = makeOrderNo();
  const buyer_note = String(body.buyer_note ?? "").trim() || null;

  const phoneRaw = String(body.buyer_phone ?? "").trim();
  const buyer_phone_norm = phoneRaw ? normalizePhMobileDb(phoneRaw) : null;
  const addrSummaryRaw = String(body.delivery_address_summary ?? "").trim();
  const addrDetailRaw = String(body.delivery_address_detail ?? "").trim();
  const delivery_address_summary = addrSummaryRaw || null;
  const delivery_address_detail = addrDetailRaw || null;
  if (fulfillment === "local_delivery" || fulfillment === "shipping") {
    if (!buyer_phone_norm) {
      return NextResponse.json(
        { ok: false, error: "buyer_phone_required", message: "연락처(09 xx xxx xxxx)를 입력해 주세요." },
        { status: 400 }
      );
    }
    if (!delivery_address_summary) {
      return NextResponse.json(
        {
          ok: false,
          error: "delivery_address_required",
          message: "배달·배송 주소를 입력해 주세요.",
        },
        { status: 400 }
      );
    }
  } else if (phoneRaw && !buyer_phone_norm) {
    return NextResponse.json(
      { ok: false, error: "invalid_buyer_phone", message: "연락처 형식을 확인해 주세요. (09 xx xxx xxxx)" },
      { status: 400 }
    );
  }

  const { data: orderRow, error: oErr } = await sb
    .from("store_orders")
    .insert({
      order_no: orderNo,
      buyer_user_id: buyerId,
      store_id: storeId,
      total_amount: Math.round(paymentGrandTotal),
      discount_amount: 0,
      payment_amount: Math.round(paymentGrandTotal),
      delivery_fee_amount: Math.round(deliveryFeeAmount),
      delivery_courier_label: deliveryCourierLabel,
      payment_status: "paid",
      order_status: "pending",
      fulfillment_type: fulfillment,
      buyer_note,
      buyer_phone: buyer_phone_norm,
      buyer_payment_method: paymentMethodRaw,
      buyer_payment_method_detail,
      delivery_address_summary,
      delivery_address_detail,
    })
    .select("id")
    .maybeSingle();

  if (oErr || !orderRow) {
    await restoreDecrementedStock(sb, stockRollback);
    console.error("[POST store-orders]", oErr);
    return NextResponse.json({ ok: false, error: oErr?.message ?? "order_insert_failed" }, { status: 500 });
  }

  const orderId = orderRow.id as string;

  for (const line of lines) {
    const { error: iErr } = await sb.from("store_order_items").insert({
      order_id: orderId,
      product_id: line.product_id,
      product_title_snapshot: line.title,
      price_snapshot: Math.round(line.unit),
      qty: line.qty,
      subtotal: Math.round(line.subtotal),
      options_snapshot_json: line.options_snapshot,
    });
    if (iErr) {
      await sb.from("store_orders").delete().eq("id", orderId);
      await restoreDecrementedStock(sb, stockRollback);
      console.error("[POST store-orders items]", iErr);
      return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
    }
  }

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: buyerId,
    target_type: "store_order",
    target_id: orderId,
    action: "store_order.create",
    after_json: {
      store_id: storeId,
      order_no: orderNo,
      payment_amount: Math.round(paymentGrandTotal),
      delivery_fee_amount: Math.round(deliveryFeeAmount),
      line_count: lines.length,
      fulfillment_type: fulfillment,
    },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  void notifyStoreOwnerNewOrder(sb, {
    storeId,
    orderId,
    orderNo,
    paymentAmount: Math.round(paymentGrandTotal),
    lineCount: lines.length,
    storeName: (store.store_name as string) ?? undefined,
    paymentLabel: formatBuyerPaymentDisplay(paymentMethodRaw, buyer_payment_method_detail),
    buyerNote: buyer_note,
  });

  try {
    const ens = await ensureStoreOrderChatRoom(sb as SupabaseClient<any>, orderId);
    if (!ens.ok) console.error("[POST store-orders] ensure chat", ens.error);
  } catch (e) {
    console.error("[POST store-orders] ensure chat", e);
  }

  const composedAddress =
    [delivery_address_summary, delivery_address_detail].filter(Boolean).join("\n") || null;
  const profilePatch: { contact_phone?: string; contact_address?: string } = {};
  if (buyer_phone_norm) profilePatch.contact_phone = buyer_phone_norm;
  if (composedAddress) profilePatch.contact_address = composedAddress;
  if (Object.keys(profilePatch).length) {
    void sb.from("test_users").update(profilePatch as never).eq("id", buyerId);
  }

  return NextResponse.json({
    ok: true,
    order: { id: orderId, order_no: orderNo, payment_amount: paymentGrandTotal },
  });
}
