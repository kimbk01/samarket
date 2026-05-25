import { randomBytes } from "crypto";
import { formatStoreOrderDeliveryAddressMultiline } from "@/lib/addresses/store-order-delivery-address-display";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { notifyStoreOwnerNewOrder } from "@/lib/notifications/notify-store-commerce";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { parseModifierWireFromBody } from "@/lib/stores/product-line-options";
import {
  validateStoreOrderCheckout,
  type StoreOrderLineInput,
} from "@/lib/stores/validate-store-order-checkout";
import { normalizePhMobileDb } from "@/lib/utils/ph-mobile";
import {
  effectiveCheckoutPaymentMethodIdsForCart,
  formatBuyerPaymentDisplay,
  isKnownCheckoutPaymentMethodId,
  readPaymentMethodsFormValues,
  type OrderCheckoutPaymentId,
} from "@/lib/stores/payment-methods-config";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { STORE_ORDER_STATUS_LIST } from "@/lib/stores/order-status-transitions";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import {
  ensureStoreOrderMessengerRoom,
} from "@/lib/community-messenger/store-order-chat-service";
import { loadBuyerStoreOrdersHubSummary } from "@/lib/stores/load-buyer-store-orders-hub-summary";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import { invalidateStoreOrderDetailSnapshot } from "@/lib/stores/store-order-detail-snapshot-cache";
import { invalidateBuyerStoreOrdersListSnapshot } from "@/lib/stores/buyer-store-orders-list-snapshot-cache";
import {
  tryLoadBuyerStoreOrdersListFromSnapshot,
} from "@/lib/stores/buyer-store-orders-list-snapshot";
import { persistStoreOrderItemOptions } from "@/lib/stores/persist-store-order-item-options";
import { normalizeStoreOrderClientKey } from "@/lib/stores/store-order-client-key";
import { createStoreOrderEvent } from "@/lib/stores/store-order-events";
import { logStoreOrderStockRestoreFailure } from "@/lib/stores/log-store-order-stock-restore-failure";
import { normalizeStoreAddressPh } from "@/lib/stores/normalize-store-address-ph";
import { computeStoreOrderCheckoutEtaSnapshot } from "@/lib/stores/compute-store-order-checkout-eta-snapshot";
import { markUserAddressUsed } from "@/lib/addresses/user-address-service";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { translate } from "@/lib/i18n/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buyerOrdersListSnapshotHeaders(snapshotVia?: string): Record<string, string> {
  if (!snapshotVia) return {};
  return {
    "x-samarket-buyer-orders-list-snapshot-path": "1",
    "x-samarket-buyer-orders-list-snapshot-via": snapshotVia,
    "x-samarket-buyer-orders-list-query-wave-2-ms": "0",
    "x-samarket-buyer-orders-list-rpc-removed": "1",
  };
}

function isStoreOrderStatusCheckViolation(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("order_status_check") ||
    (m.includes("violates check constraint") && m.includes("order_status"))
  );
}

async function restoreDecrementedStock(
  sb: SupabaseClient,
  rollback: { id: string; delta: number }[],
  orderId?: string | null
) {
  for (let i = 0; i < rollback.length; i++) {
    const r = rollback[i]!;
    const { data: cur } = await sb
      .from("store_products")
      .select("stock_qty, product_status")
      .eq("id", r.id)
      .maybeSingle();
    if (cur) {
      const n = (cur.stock_qty as number) + r.delta;
      const { error: restoreErr } = await sb
        .from("store_products")
        .update({
          stock_qty: n,
          product_status: n > 0 && cur.product_status === "sold_out" ? "active" : cur.product_status,
        })
        .eq("id", r.id);
      if (restoreErr) {
        await logStoreOrderStockRestoreFailure(sb, {
          orderId,
          productId: r.id,
          delta: r.delta,
          message: restoreErr.message,
          rollbackRemaining: rollback.slice(i),
        });
      }
    }
  }
}

function makeOrderNo() {
  return `SO${Date.now()}${randomBytes(2).toString("hex")}`;
}

async function fetchExistingBuyerOrderByClientKey(
  sb: SupabaseClient,
  buyerUserId: string,
  clientKey: string
): Promise<{ id: string; order_no: string; payment_amount: number } | null> {
  const { data, error } = await sb
    .from("store_orders")
    .select("id, order_no, payment_amount")
    .eq("buyer_user_id", buyerUserId)
    .eq("client_order_key", clientKey)
    .maybeSingle();
  if (error || !data?.id) return null;
  return {
    id: String(data.id),
    order_no: String(data.order_no ?? ""),
    payment_amount: Number(data.payment_amount ?? 0),
  };
}

function normalizeOrderLineItem(raw: unknown): StoreOrderLineInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const product_id = String(r.product_id ?? "").trim();
  const qty = Math.floor(Number(r.qty));
  if (!product_id || !Number.isFinite(qty) || qty < 1) return null;
  const wire = parseModifierWireFromBody(r);
  const line_note = String(r.line_note ?? "").trim() || null;
  const clientRaw = r.client_unit_php ?? r.unit_price_php;
  const client_unit_php =
    clientRaw != null && clientRaw !== "" && Number.isFinite(Number(clientRaw))
      ? Number(clientRaw)
      : null;
  return { product_id, qty, wire, line_note, client_unit_php };
}

/** 구매자: 매장 주문 목록 — `?limit=` (1~100, 기본 100) 로 홈 미리보기 등 부분 로드 */
export async function GET(req: NextRequest) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(buyerId);
  if (!session.ok) return session.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const hubSummaryFlag = req.nextUrl.searchParams.get("hub_summary");
  if (hubSummaryFlag === "1" || hubSummaryFlag === "true") {
    const summary = await loadBuyerStoreOrdersHubSummary(sb as SupabaseClient, buyerId);
    if (!summary.ok) {
      return NextResponse.json({ ok: false, error: summary.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, hub_summary: summary.hub_summary });
  }

  const rawLimit = req.nextUrl.searchParams.get("limit");
  let rowLimit = 100;
  if (rawLimit != null && rawLimit !== "") {
    const n = Math.floor(Number(rawLimit));
    if (Number.isFinite(n) && n >= 1) {
      rowLimit = Math.min(n, 100);
    }
  }

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const buyerOrdersListBypass =
    req.nextUrl.searchParams.get("buyerOrdersListBypass") === "1" &&
    process.env.NODE_ENV === "development";

  const snap = await tryLoadBuyerStoreOrdersListFromSnapshot(
    sb as SupabaseClient<any>,
    buyerId,
    { limit: rowLimit, bypassCounter: fresh || buyerOrdersListBypass }
  );

  if (snap && "body" in snap) {
    return NextResponse.json(snap.body, {
      headers: buyerOrdersListSnapshotHeaders(snap.snapshotVia),
    });
  }

  if (snap && "ok" in snap && snap.ok === false) {
    return NextResponse.json({ ok: false, error: snap.error }, { status: snap.status });
  }

  return NextResponse.json(
    { ok: false, error: "snapshot_unavailable" },
    { status: 503 }
  );
}

type PostBody = {
  store_id?: string;
  items?: unknown[];
  fulfillment_type?: string;
  buyer_note?: string;
  buyer_phone?: string;
  /** 고객 선택 결제 수단: cod | gcash | bank_transfer | other | card_on_delivery */
  payment_method?: string;
  /** 배달·택배 수령지 한 줄 */
  delivery_address_summary?: string;
  delivery_address_detail?: string;
  /** 지역 키(향후 배달 권역 기준) */
  delivery_region?: string;
  delivery_city?: string;
  /** `user_addresses.id` — ETA 스냅샷·라우팅용(본인 주소만) */
  delivery_user_address_id?: string;
  delivery_note?: string;
  /** 멱등 키 — 재전송·더블클릭 시 동일 주문 반환 */
  client_order_key?: string;
};

type DeliveryAddressOrderSnapshot = {
  place_id?: string | null;
  formatted_address?: string | null;
  detail_address?: string | null;
  delivery_note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  const session = await validateActiveSession(buyerId);
  if (!session.ok) return session.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const access = await assertVerifiedMemberForAction(sb as any, buyerId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const normalizedClientKey = normalizeStoreOrderClientKey(body.client_order_key);
  if (normalizedClientKey) {
    const existingHit = await fetchExistingBuyerOrderByClientKey(sb, buyerId, normalizedClientKey);
    if (existingHit) {
      return NextResponse.json({
        ok: true,
        order: existingHit,
        idempotent: true,
      });
    }
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

  const orderLines: StoreOrderLineInput[] = [];
  for (const raw of items) {
    const row = normalizeOrderLineItem(raw);
    if (!row) {
      return NextResponse.json({ ok: false, error: "invalid_line" }, { status: 400 });
    }
    orderLines.push(row);
  }

  const validated = await validateStoreOrderCheckout({
    sb,
    buyerId,
    storeId,
    fulfillment,
    items: orderLines,
  });
  if (!validated.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: validated.error,
        ...(validated.min_order_php != null ? { min_order_php: validated.min_order_php } : {}),
      },
      { status: validated.status }
    );
  }

  const { lines, paymentTotal, deliveryFeeAmount, paymentGrandTotal, productsById } = validated;

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select(
      "id, owner_user_id, approval_status, is_visible, store_name, is_open, business_hours_json, pickup_available, delivery_available, lat, lng"
    )
    .eq("id", storeId)
    .maybeSingle();

  if (sErr || !store || store.approval_status !== "approved" || !store.is_visible) {
    return NextResponse.json({ ok: false, error: "store_unavailable" }, { status: 400 });
  }

  const commerceExtras = parseCommerceExtrasFromHoursJson(store.business_hours_json);
  const deliveryCourierLabel =
    fulfillment === "local_delivery" && commerceExtras.deliveryCourierLabel?.trim()
      ? commerceExtras.deliveryCourierLabel.trim()
      : null;

  const allowedPaymentMethods = effectiveCheckoutPaymentMethodIdsForCart(
    store.business_hours_json
  );
  const paymentMethodRaw = String(body.payment_method ?? "").trim();
  if (!paymentMethodRaw) {
    return NextResponse.json({ ok: false, error: "payment_method_required" }, { status: 400 });
  }
  if (
    !isKnownCheckoutPaymentMethodId(paymentMethodRaw) ||
    !allowedPaymentMethods.includes(paymentMethodRaw as OrderCheckoutPaymentId)
  ) {
    return NextResponse.json({ ok: false, error: "payment_method_invalid" }, { status: 400 });
  }

  const buyerLang = await loadNotificationUserLanguage(sb, buyerId);
  const payCfgAtOrder = readPaymentMethodsFormValues(store.business_hours_json);
  const buyer_payment_method_detail =
    paymentMethodRaw === "other"
      ? payCfgAtOrder.payMethodOtherText.trim() || translate(buyerLang, "store_pay_label_other")
      : null;

  const stockRollback: { id: string; delta: number }[] = [];

  for (const line of lines) {
    const p = productsById[line.product_id];
    if (!p) {
      return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
    }
    const trackStock = p.track_inventory === true;
    if (!trackStock) continue;
    const prev = Number(p.stock_qty);
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
  /** 주문자 배달·배송지(매장 주소와 별도). 픽업이면 비워도 됨 — 픽업 장소는 `stores` 주소로 안내 */
  const addrSummaryRaw = String(body.delivery_address_summary ?? "").trim();
  const addrDetailRaw = String(body.delivery_address_detail ?? "").trim();
  const delivery_region_raw = String(body.delivery_region ?? "").trim();
  const delivery_city_raw = String(body.delivery_city ?? "").trim();

  // 주문 주소 저장 규격 고정 (PH):
  // - 지역(delivery_region/city)은 운영/권역 키
  // - summary=주소1(도로/번지), detail=세부주소(호수/층/랜드마크)
  const normDeliveryAddr = normalizeStoreAddressPh({
    region: delivery_region_raw || null,
    city: delivery_city_raw || null,
    address1: addrSummaryRaw || null,
    address2: addrDetailRaw || null,
  });
  const delivery_address_summary = normDeliveryAddr.address1;
  const delivery_address_detail = normDeliveryAddr.address2;
  const delivery_region = normDeliveryAddr.region;
  const delivery_city = normDeliveryAddr.city;
  if (fulfillment === "local_delivery" || fulfillment === "shipping") {
    if (!buyer_phone_norm) {
      return NextResponse.json({ ok: false, error: "buyer_phone_required" }, { status: 400 });
    }
    if (!delivery_address_summary) {
      return NextResponse.json({ ok: false, error: "delivery_address_required" }, { status: 400 });
    }
    if (!delivery_region || !delivery_city) {
      return NextResponse.json({ ok: false, error: "delivery_region_city_required" }, { status: 400 });
    }
  } else if (phoneRaw && !buyer_phone_norm) {
    return NextResponse.json({ ok: false, error: "invalid_buyer_phone" }, { status: 400 });
  }

  const storeRow = store as { lat?: number | null; lng?: number | null };
  const storeLat =
    storeRow.lat != null && Number.isFinite(Number(storeRow.lat)) ? Number(storeRow.lat) : null;
  const storeLng =
    storeRow.lng != null && Number.isFinite(Number(storeRow.lng)) ? Number(storeRow.lng) : null;
  const deliveryUserAddressId = String(body.delivery_user_address_id ?? "").trim() || null;

  let deliveryAddressSnapshot: DeliveryAddressOrderSnapshot | null = null;

  if (fulfillment === "local_delivery" && !deliveryUserAddressId) {
    return NextResponse.json({ ok: false, error: "delivery_user_address_required" }, { status: 400 });
  }

  if (fulfillment === "local_delivery" && deliveryUserAddressId) {
    const { data: ownAddr, error: ownAddrErr } = await sb
      .from("user_addresses")
      .select("id, place_id, formatted_address, detail_address, delivery_note, latitude, longitude")
      .eq("id", deliveryUserAddressId)
      .eq("user_id", buyerId)
      .maybeSingle();
    if (ownAddrErr || !ownAddr) {
      return NextResponse.json({ ok: false, error: "delivery_user_address_invalid" }, { status: 400 });
    }
    deliveryAddressSnapshot = ownAddr as DeliveryAddressOrderSnapshot;
  }

  const etaSnapshot = await computeStoreOrderCheckoutEtaSnapshot({
    sb,
    buyerUserId: buyerId,
    fulfillment,
    deliveryUserAddressId,
    storeLat,
    storeLng,
    business_hours_json: store.business_hours_json,
  });

  const insertOrderPayload: Record<string, unknown> = {
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
    delivery_region,
    delivery_city,
    delivery_place_id: deliveryAddressSnapshot?.place_id ?? null,
    delivery_formatted_address: deliveryAddressSnapshot?.formatted_address ?? delivery_address_summary,
    delivery_detail_address: deliveryAddressSnapshot?.detail_address ?? delivery_address_detail,
    delivery_note: String(body.delivery_note ?? deliveryAddressSnapshot?.delivery_note ?? "").trim() || null,
    delivery_latitude: deliveryAddressSnapshot?.latitude ?? null,
    delivery_longitude: deliveryAddressSnapshot?.longitude ?? null,
    ...etaSnapshot,
  };
  if (normalizedClientKey) {
    insertOrderPayload.client_order_key = normalizedClientKey;
  }
  if (deliveryUserAddressId) {
    insertOrderPayload.delivery_user_address_id = deliveryUserAddressId;
  }

  const { data: orderRow, error: oErr } = await sb
    .from("store_orders")
    .insert(insertOrderPayload as never)
    .select("id")
    .maybeSingle();

  if (oErr || !orderRow) {
    await restoreDecrementedStock(sb, stockRollback, null);
    const pgCode = (oErr as { code?: string } | null)?.code;
    if (normalizedClientKey && pgCode === "23505") {
      const recovered = await fetchExistingBuyerOrderByClientKey(sb, buyerId, normalizedClientKey);
      if (recovered) {
        return NextResponse.json({
          ok: true,
          order: recovered,
          idempotent: true,
        });
      }
      return NextResponse.json({ ok: false, error: "order_idempotency_conflict" }, { status: 409 });
    }
    console.error("[POST store-orders]", oErr);
    const raw = oErr?.message ?? "order_insert_failed";
    if (isStoreOrderStatusCheckViolation(raw)) {
      return NextResponse.json(
        {
          ok: false,
          error: "order_status_schema_mismatch",
          allowed_order_status: [...STORE_ORDER_STATUS_LIST],
          detail: raw,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: raw }, { status: 500 });
  }

  const orderId = orderRow.id as string;
  if (deliveryUserAddressId) {
    await markUserAddressUsed(sb, buyerId, deliveryUserAddressId);
  }

  for (const line of lines) {
    const { data: itemRow, error: iErr } = await sb
      .from("store_order_items")
      .insert({
        order_id: orderId,
        product_id: line.product_id,
        product_title_snapshot: line.title,
        price_snapshot: Math.round(line.unit),
        qty: line.qty,
        subtotal: Math.round(line.subtotal),
        options_snapshot_json: line.options_snapshot,
        base_price_snapshot: Math.round(line.base_unit_after_discount),
        options_unit_delta_snapshot: Math.round(line.unit_options_delta),
      })
      .select("id")
      .maybeSingle();
    if (iErr || !itemRow?.id) {
      await sb.from("store_orders").delete().eq("id", orderId);
      await restoreDecrementedStock(sb, stockRollback, orderId);
      void appendAuditLog(sb, {
        actor_type: "user",
        actor_id: buyerId,
        target_type: "store_order",
        target_id: orderId,
        action: "store_order.item_insert_failed",
        after_json: {
          product_id: line.product_id,
          error: iErr?.message ?? "order_item_insert_failed",
        },
      });
      console.error("[POST store-orders items]", iErr);
      return NextResponse.json(
        { ok: false, error: iErr?.message ?? "order_item_insert_failed" },
        { status: 500 }
      );
    }
    await persistStoreOrderItemOptions(sb, itemRow.id as string, line.options_snapshot);
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

  const createdEv = await createStoreOrderEvent(sb, {
    orderId,
    storeId,
    actorUserId: buyerId,
    actorRole: "buyer",
    eventType: "order_created",
    fromStatus: null,
    toStatus: "pending",
    dedupeKey: `${orderId}:order_created`,
    metadata: {
      order_no: orderNo,
      payment_amount: Math.round(paymentGrandTotal),
      line_count: lines.length,
      fulfillment_type: fulfillment,
    },
  });

  const ownerUserId = String(store.owner_user_id ?? "").trim();
  const ownerLang = ownerUserId ? await loadNotificationUserLanguage(sb, ownerUserId) : buyerLang;
  const notifyOwnerPayload = {
    storeId,
    orderId,
    orderNo,
    paymentAmount: Math.round(paymentGrandTotal),
    lineCount: lines.length,
    storeName: (store.store_name as string) ?? undefined,
    paymentLabel: formatBuyerPaymentDisplay(
      paymentMethodRaw,
      buyer_payment_method_detail,
      ownerLang
    ),
    buyerNote: buyer_note,
  };
  if (createdEv.ok) {
    if (createdEv.inserted) {
      void notifyStoreOwnerNewOrder(sb, { ...notifyOwnerPayload, storeOrderEventId: createdEv.row.id });
    }
  } else {
    /** 이벤트 원장 삽입 실패 시에도 알림은 dedupe_key(order_id 기반)로 1회만 */
    void notifyStoreOwnerNewOrder(sb, notifyOwnerPayload);
  }

  try {
    const ens = await ensureStoreOrderMessengerRoom(sb as SupabaseClient<any>, { orderId, userId: buyerId });
    if (!ens.ok) console.error("[POST store-orders] ensure order chat", ens.error);
  } catch (e) {
    console.error("[POST store-orders] ensure order chat", e);
  }

  const composedPlain = formatStoreOrderDeliveryAddressMultiline({
    summary: delivery_address_summary,
    detail: delivery_address_detail,
  });
  const composedAddress = composedPlain === "—" ? null : composedPlain;
  const profilePatch: { contact_phone?: string; contact_address?: string } = {};
  if (buyer_phone_norm) profilePatch.contact_phone = buyer_phone_norm;
  if (composedAddress) profilePatch.contact_address = composedAddress;
  if (Object.keys(profilePatch).length) {
    void sb.from("test_users").update(profilePatch as never).eq("id", buyerId);
  }

  const ownerUid = String((store as { owner_user_id?: string }).owner_user_id ?? "").trim();
  invalidateStoreOrderCountsCache(storeId, ownerUid || undefined);
  if (ownerUid) invalidateOwnerHubBadgeCache(ownerUid);
  invalidateStoreOrderDetailSnapshot(orderId, buyerId, "order_created");
  invalidateBuyerStoreOrdersListSnapshot(buyerId, "order_created");

  return NextResponse.json({
    ok: true,
    order: { id: orderId, order_no: orderNo, payment_amount: paymentGrandTotal },
    idempotent: false,
  });
}
