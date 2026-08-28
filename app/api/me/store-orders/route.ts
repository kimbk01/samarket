import { randomBytes } from "crypto";
import { formatStoreOrderDeliveryAddressMultiline } from "@/lib/addresses/store-order-delivery-address-display";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { notifyStoreOwnerNewOrder, notifyStoreOwnerProductSoldOutFromOrder } from "@/lib/notifications/notify-store-commerce";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
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
import {
  ensureStoreOrderMessengerRoom,
} from "@/lib/community-messenger/store-order-chat-service";
import { loadBuyerStoreOrdersHubSummary } from "@/lib/delivery/customer/load-buyer-store-orders-hub-summary";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import { invalidateStoreOrderDetailSnapshot } from "@/lib/stores/store-order-detail-snapshot-cache";
import { invalidateBuyerStoreOrdersListSnapshot } from "@/lib/delivery/customer/buyer-store-orders-list-snapshot-cache";
import {
  giftInstanceAllowsCheckoutStore,
  isGiftScope,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import {
  tryLoadBuyerStoreOrdersListFromSnapshot,
} from "@/lib/delivery/customer/buyer-store-orders-list-snapshot";
import { normalizeStoreOrderClientKey } from "@/lib/stores/store-order-client-key";
import { normalizeStoreAddressPh } from "@/lib/stores/normalize-store-address-ph";
import { computeStoreOrderCheckoutEtaSnapshot } from "@/lib/stores/compute-store-order-checkout-eta-snapshot";
import {
  resolveStoreCouponCheckoutDiscount,
} from "@/lib/stores/resolve-store-coupon-checkout-discount";
import { splitCouponFunding } from "@/lib/stores/store-coupon-funding-math";
import { loadDeliveryDistanceSettings, DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED } from "@/lib/delivery/delivery-ops-settings";
import { evaluateDeliveryServiceability } from "@/lib/delivery/evaluate-delivery-serviceability";
import { STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY } from "@/lib/delivery/store-order-serviceability-snapshot-ready";
import {
  getUserAddressDefaults,
  markUserAddressUsed,
  pickAddressRowForDeliveryRouting,
} from "@/lib/addresses/user-address-service";
import { toCheckoutDeliveryPayload, type CheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { translate } from "@/lib/i18n/messages";
import { createStoreOrderAtomic } from "@/lib/stores/create-store-order-atomic";

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
  payment_method?: string;
  delivery_address_summary?: string;
  delivery_address_detail?: string;
  delivery_region?: string;
  delivery_city?: string;
  delivery_user_address_id?: string;
  delivery_note?: string;
  client_order_key?: string;
  coupon_campaign_id?: string;
  user_coupon_id?: string;
  /** Paid gift — [{ instance_id, amount }] — not a coupon discount (legacy shape) */
  gift_redemptions?: unknown;
  /** Paid gift instance ids (max 1); amounts computed in create_store_order_atomic */
  gift_instance_ids?: unknown;
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
 * 주문 생성 — Phase 5 atomic RPC.
 * payment_status=paid 는 주문 금액 확정 메타(정산·크론 호환).
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

  const access = await requireSignupCompleteForUser(sb as import("@supabase/supabase-js").SupabaseClient, buyerId);
  if (!access.ok) return access.response;

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    buyerId,
    "delivery_order"
  );
  if (!profileGate.ok) return profileGate.response;

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

  // Phase B D6: single store read — pass into validate (no second select)
  const { data: store, error: sErr } = await sb
    .from("stores")
    .select(
      "id, owner_user_id, approval_status, is_visible, store_name, is_open, point_commerce_blocked, business_hours_json, pickup_available, delivery_available, lat, lng"
    )
    .eq("id", storeId)
    .maybeSingle();

  if (sErr || !store || store.approval_status !== "approved" || !store.is_visible) {
    return NextResponse.json({ ok: false, error: "store_unavailable" }, { status: 400 });
  }

  const validated = await validateStoreOrderCheckout({
    sb,
    buyerId,
    storeId,
    fulfillment,
    items: orderLines,
    store: {
      id: String(store.id),
      owner_user_id: String(store.owner_user_id ?? ""),
      approval_status: String(store.approval_status ?? ""),
      is_visible: !!store.is_visible,
      is_open: (store.is_open as boolean | null) ?? null,
      point_commerce_blocked: (store as { point_commerce_blocked?: boolean | null })
        .point_commerce_blocked,
      business_hours_json: store.business_hours_json,
      pickup_available: store.pickup_available as boolean | null | undefined,
      delivery_available: store.delivery_available as boolean | null | undefined,
    },
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

  const { lines, deliveryFeeAmount, paymentGrandTotal, paymentTotal, productsById } = validated;

  const couponCampaignId = String(body.coupon_campaign_id ?? "").trim();
  const userCouponId = String(body.user_coupon_id ?? "").trim();
  let discountAmount = 0;
  let storeFundedAmount = 0;
  let platformFundedAmount = 0;
  const commissionBaseAmount = Math.round(paymentGrandTotal);
  if (couponCampaignId) {
    if (buyerId === String(store.owner_user_id ?? "")) {
      return NextResponse.json({ ok: false, error: "owner_self_order_denied" }, { status: 403 });
    }
    // Canonical: Coupon Instance required — campaign-only checkout DELETED
    if (!userCouponId) {
      return NextResponse.json({ ok: false, error: "coupon_entitlement_required" }, { status: 400 });
    }
    const { data: ent } = await sb
      .from("coupon_user_entitlements")
      .select("id, status, campaign_id, buyer_user_id, expires_at")
      .eq("id", userCouponId)
      .maybeSingle();
    if (
      !ent ||
      String(ent.buyer_user_id) !== buyerId ||
      String(ent.campaign_id) !== couponCampaignId ||
      !["available", "restored"].includes(String(ent.status))
    ) {
      return NextResponse.json({ ok: false, error: "coupon_not_found" }, { status: 400 });
    }
    const heldExpiresAtMs = Date.parse(String(ent.expires_at ?? ""));
    const couponResult = await resolveStoreCouponCheckoutDiscount({
      sb,
      buyerUserId: buyerId,
      storeId,
      couponCampaignId,
      itemGrossPhp: Math.round(paymentTotal),
      heldUsableEntitlement: true,
      usageWindowEndMs: Number.isFinite(heldExpiresAtMs) ? heldExpiresAtMs : null,
    });
    if (!couponResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: couponResult.error,
          ...(couponResult.min_order_amount != null
            ? { min_order_amount: couponResult.min_order_amount }
            : {}),
        },
        { status: couponResult.status }
      );
    }
    discountAmount = couponResult.discountAmount;
    const { data: campFund } = await sb
      .from("store_coupon_campaigns")
      .select("funding_mode, store_funded_amount")
      .eq("id", couponCampaignId)
      .maybeSingle();
    const mode = String(campFund?.funding_mode ?? "STORE_FUNDED");
    const split = splitCouponFunding({
      discountPhp: discountAmount,
      fundingMode:
        mode === "PLATFORM_FUNDED" || mode === "SHARED_FUNDED" ? mode : "STORE_FUNDED",
      storeFundedPhp:
        campFund?.store_funded_amount == null ? null : Number(campFund.store_funded_amount),
    });
    storeFundedAmount = split.storeFundedAmount;
    platformFundedAmount = split.platformFundedAmount;
  }
  const paymentAfterDiscount = Math.max(0, Math.round(paymentGrandTotal - discountAmount));

  // G7 — gift instance ids only (amounts computed inside create_store_order_atomic).
  // Accept legacy gift_redemptions[].instance_id shape for clients; ignore client amounts.
  const giftInstanceIds: string[] = [];
  if (Array.isArray(body.gift_instance_ids)) {
    for (const raw of body.gift_instance_ids) {
      const id = String(raw ?? "").trim();
      if (id) giftInstanceIds.push(id);
    }
  } else if (Array.isArray(body.gift_redemptions)) {
    for (const raw of body.gift_redemptions) {
      if (!raw || typeof raw !== "object") {
        return NextResponse.json({ ok: false, error: "invalid_gift_redemption" }, { status: 400 });
      }
      const rec = raw as Record<string, unknown>;
      const instanceId = String(rec.instance_id ?? rec.instanceId ?? "").trim();
      if (!instanceId) {
        return NextResponse.json({ ok: false, error: "invalid_gift_redemption" }, { status: 400 });
      }
      giftInstanceIds.push(instanceId);
    }
  }
  if (giftInstanceIds.length > 1) {
    return NextResponse.json({ ok: false, error: "gift_max_one_per_order" }, { status: 400 });
  }
  // Read-only UX precheck (authoritative lock+debit is inside atomic RPC).
  if (giftInstanceIds.length === 1) {
    const gid = giftInstanceIds[0]!;
    const { data: giftRow, error: giftErr } = await sb
      .from("gift_certificate_instances")
      .select("id, store_id, gift_scope, current_owner_user_id, remaining_balance, status")
      .eq("id", gid)
      .maybeSingle();
    if (giftErr) {
      return NextResponse.json({ ok: false, error: giftErr.message }, { status: 500 });
    }
    if (!giftRow) {
      return NextResponse.json({ ok: false, error: "gift_instance_not_found" }, { status: 400 });
    }
    const row = giftRow as Record<string, unknown>;
    if (String(row.current_owner_user_id) !== buyerId) {
      return NextResponse.json({ ok: false, error: "gift_not_owner" }, { status: 403 });
    }
    const scope = isGiftScope(row.gift_scope) ? row.gift_scope : "STORE";
    const instanceStoreId =
      row.store_id == null || String(row.store_id).trim() === ""
        ? null
        : String(row.store_id);
    if (
      !giftInstanceAllowsCheckoutStore({
        giftScope: scope,
        instanceStoreId,
        checkoutStoreId: storeId,
      })
    ) {
      return NextResponse.json({ ok: false, error: "gift_store_mismatch" }, { status: 400 });
    }
    const status = String(row.status ?? "");
    if (status !== "ACTIVE" && status !== "PARTIALLY_REDEEMED") {
      return NextResponse.json({ ok: false, error: "gift_invalid_status" }, { status: 400 });
    }
    if (Math.trunc(Number(row.remaining_balance) || 0) <= 0) {
      return NextResponse.json({ ok: false, error: "gift_insufficient_remaining" }, { status: 400 });
    }
  }
  const amountBeforeGift = paymentAfterDiscount;
  // Provisional payment; create_store_order_atomic recomputes when gift_instance_ids present.
  const paymentAfterGift = amountBeforeGift;

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

  const orderNo = makeOrderNo();
  const buyer_note = String(body.buyer_note ?? "").trim() || null;

  const phoneRaw = String(body.buyer_phone ?? "").trim();
  const buyer_phone_norm = phoneRaw ? normalizePhMobileDb(phoneRaw) : null;
  const requestedDeliveryUserAddressId = String(body.delivery_user_address_id ?? "").trim() || null;
  let masterCheckoutPayload: CheckoutDeliveryPayload | null = null;

  if (fulfillment === "local_delivery") {
    const masterRow = pickAddressRowForDeliveryRouting(await getUserAddressDefaults(sb, buyerId));
    if (!masterRow?.id) {
      return NextResponse.json({ ok: false, error: "delivery_user_address_required" }, { status: 400 });
    }
    if (requestedDeliveryUserAddressId && requestedDeliveryUserAddressId !== masterRow.id) {
      return NextResponse.json({ ok: false, error: "delivery_user_address_not_master" }, { status: 400 });
    }
    masterCheckoutPayload = toCheckoutDeliveryPayload(masterRow);
  }

  const addrSummaryRaw = String(masterCheckoutPayload?.summary_line ?? body.delivery_address_summary ?? "").trim();
  const addrDetailRaw = String(masterCheckoutPayload?.address_detail ?? body.delivery_address_detail ?? "").trim();
  const delivery_region_raw = String(masterCheckoutPayload?.app_region_id ?? body.delivery_region ?? "").trim();
  const delivery_city_raw = String(masterCheckoutPayload?.app_city_id ?? body.delivery_city ?? "").trim();

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
  const deliveryUserAddressId = masterCheckoutPayload?.user_address_id ?? requestedDeliveryUserAddressId;

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

  if (fulfillment === "local_delivery") {
    const deliveryDetail =
      String(deliveryAddressSnapshot?.detail_address ?? "").trim() ||
      String(delivery_address_detail ?? "").trim();
    if (!deliveryDetail) {
      return NextResponse.json({ ok: false, error: "delivery_detail_address_required" }, { status: 400 });
    }
  }

  let serviceabilitySnapshot: {
    checkout_store_latitude: number | null;
    checkout_store_longitude: number | null;
    checkout_serviceability_eligible: boolean;
    checkout_serviceability_max_km: number | null;
    checkout_serviceability_reason: string;
  } | null = null;

  if (fulfillment === "local_delivery") {
    const distanceSettings = await loadDeliveryDistanceSettings(sb);
    const policy = {
      ...distanceSettings.policy,
      enabled: DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED && distanceSettings.policy.enabled,
    };
    const svc = evaluateDeliveryServiceability({
      policy,
      overrides: distanceSettings.overrides,
      storeId,
      customerLat: deliveryAddressSnapshot?.latitude,
      customerLng: deliveryAddressSnapshot?.longitude,
      storeLat,
      storeLng,
    });
    serviceabilitySnapshot = {
      checkout_store_latitude: storeLat,
      checkout_store_longitude: storeLng,
      checkout_serviceability_eligible: svc.eligible,
      checkout_serviceability_max_km: svc.maxKm,
      checkout_serviceability_reason: svc.reason,
    };
    if (!svc.eligible) {
      const error =
        svc.reason === "missing_customer_coords"
          ? "delivery_customer_coords_required"
          : svc.reason === "missing_store_coords"
            ? "delivery_store_coords_required"
            : "delivery_out_of_range";
      return NextResponse.json(
        {
          ok: false,
          error,
          distance_km: svc.distanceKm,
          max_km: svc.maxKm,
          reason: svc.reason,
        },
        { status: 400 }
      );
    }
  }

  const etaSnapshot = await computeStoreOrderCheckoutEtaSnapshot({
    sb,
    buyerUserId: buyerId,
    fulfillment,
    deliveryUserAddressId,
    deliverySnapshotLat: deliveryAddressSnapshot?.latitude ?? null,
    deliverySnapshotLng: deliveryAddressSnapshot?.longitude ?? null,
    storeLat,
    storeLng,
    business_hours_json: store.business_hours_json,
  });

  const atomic = await createStoreOrderAtomic(sb, {
    buyerUserId: buyerId,
    storeId,
    clientOrderKey: normalizedClientKey,
    order: {
      order_no: orderNo,
      total_amount: Math.round(paymentGrandTotal),
      discount_amount: Math.round(discountAmount),
      payment_amount: Math.round(paymentAfterGift),
      delivery_fee_amount: Math.round(deliveryFeeAmount),
      delivery_courier_label: deliveryCourierLabel,
      payment_status: "paid",
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
      delivery_formatted_address:
        deliveryAddressSnapshot?.formatted_address ?? delivery_address_summary,
      delivery_detail_address:
        deliveryAddressSnapshot?.detail_address ?? delivery_address_detail,
      delivery_note:
        String(body.delivery_note ?? deliveryAddressSnapshot?.delivery_note ?? "").trim() || null,
      delivery_latitude: deliveryAddressSnapshot?.latitude ?? null,
      delivery_longitude: deliveryAddressSnapshot?.longitude ?? null,
      delivery_user_address_id: deliveryUserAddressId,
      ...etaSnapshot,
      amount_before_gift: amountBeforeGift,
      ...(giftInstanceIds.length > 0 ? { gift_instance_ids: giftInstanceIds } : {}),
      ...(couponCampaignId && discountAmount > 0 && userCouponId
        ? {
            coupon_campaign_id: couponCampaignId,
            user_coupon_id: userCouponId,
            store_funded_amount: storeFundedAmount,
            platform_funded_amount: platformFundedAmount,
            commission_base_amount: commissionBaseAmount,
          }
        : {}),
    },
    lines: lines.map((line) => ({
      ...line,
      expected_options_json: productsById[line.product_id]?.options_json ?? null,
    })),
  });

  if (!atomic.ok) {
    if (atomic.error === "create_store_order_atomic_missing") {
      return NextResponse.json(
        {
          ok: false,
          error: "create_store_order_atomic_missing",
          hint: "Apply migration 20261022120000_create_store_order_atomic.sql",
        },
        { status: 503 }
      );
    }
    if (atomic.error.includes("order_status") || atomic.error.includes("check constraint")) {
      return NextResponse.json(
        {
          ok: false,
          error: "order_status_schema_mismatch",
          allowed_order_status: [...STORE_ORDER_STATUS_LIST],
          detail: atomic.error,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { ok: false, error: atomic.error },
      { status: atomic.httpStatus }
    );
  }

  const orderId = atomic.order.id;
  const resolvedOrderNo = atomic.order.order_no || orderNo;
  const paymentAmount = atomic.order.payment_amount;

  // G7: gift redemption is inside create_store_order_atomic (same TX). No post-order redeem.

  if (userCouponId && discountAmount > 0) {
    try {
      const { data: entSnap } = await sb
        .from("coupon_user_entitlements")
        .select("coupon_number, offer_snapshot, store_coupon_campaigns(title)")
        .eq("id", userCouponId)
        .maybeSingle();
      const snap = (entSnap as { offer_snapshot?: unknown } | null)?.offer_snapshot;
      let couponOfferTitle = "";
      if (snap && typeof snap === "object" && !Array.isArray(snap) && (snap as { title?: unknown }).title != null) {
        couponOfferTitle = String((snap as { title?: unknown }).title).trim();
      }
      if (!couponOfferTitle) {
        const campRaw = (entSnap as { store_coupon_campaigns?: unknown } | null)?.store_coupon_campaigns;
        const camp = Array.isArray(campRaw) ? campRaw[0] : campRaw;
        if (camp && typeof camp === "object" && (camp as { title?: unknown }).title != null) {
          couponOfferTitle = String((camp as { title?: unknown }).title).trim();
        }
      }
      const couponNumber =
        (entSnap as { coupon_number?: string | null } | null)?.coupon_number == null
          ? ""
          : String((entSnap as { coupon_number?: string }).coupon_number).trim();
      if (couponOfferTitle || couponNumber) {
        const { error: couponSnapErr } = await sb
          .from("store_orders")
          .update({
            ...(couponOfferTitle ? { coupon_offer_title: couponOfferTitle } : {}),
            ...(couponNumber ? { coupon_number: couponNumber } : {}),
          })
          .eq("id", orderId);
        if (couponSnapErr) {
          console.error("[POST /api/me/store-orders] coupon display snapshot", couponSnapErr.message);
        }
      }
    } catch (e) {
      console.error("[POST /api/me/store-orders] coupon display snapshot", e);
    }
  }

  if (atomic.idempotent) {
    return NextResponse.json({
      ok: true,
      order: {
        id: orderId,
        order_no: resolvedOrderNo,
        payment_amount: paymentAmount,
      },
      idempotent: true,
    });
  }

  if (serviceabilitySnapshot && STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY) {
    const { error: snapErr } = await sb
      .from("store_orders")
      .update(serviceabilitySnapshot)
      .eq("id", orderId);
    if (snapErr) {
      console.error("[POST /api/me/store-orders] serviceability snapshot", snapErr.message);
    }
  } else if (serviceabilitySnapshot && !STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY) {
    console.info(
      "[POST /api/me/store-orders] serviceability snapshot skipped — STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY=false (apply migration 20261120140000 first)"
    );
  }

  if (deliveryUserAddressId) {
    await markUserAddressUsed(sb, buyerId, deliveryUserAddressId);
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
      order_no: resolvedOrderNo,
      payment_amount: Math.round(paymentAmount),
      delivery_fee_amount: Math.round(deliveryFeeAmount),
      line_count: lines.length,
      fulfillment_type: fulfillment,
      atomic: true,
    },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  const ownerUserId =
    String(atomic.ownerUserId ?? store.owner_user_id ?? "").trim() ||
    String(store.owner_user_id ?? "").trim();
  const storeName = atomic.storeName ?? (store.store_name as string) ?? undefined;
  const ownerLang = ownerUserId ? await loadNotificationUserLanguage(sb, ownerUserId) : buyerLang;
  const notifyOwnerPayload = {
    storeId,
    orderId,
    orderNo: resolvedOrderNo,
    paymentAmount: Math.round(paymentAmount),
    lineCount: lines.length,
    storeName,
    paymentLabel: formatBuyerPaymentDisplay(
      paymentMethodRaw,
      buyer_payment_method_detail,
      ownerLang
    ),
    buyerNote: buyer_note,
  };

  const ownerNotifyTasks: Promise<void>[] = [];
  ownerNotifyTasks.push(
    notifyStoreOwnerNewOrder(sb, {
      ...notifyOwnerPayload,
      ...(atomic.orderCreatedEventId
        ? { storeOrderEventId: atomic.orderCreatedEventId }
        : {}),
    })
  );

  if (ownerUserId && atomic.soldOutProducts.length) {
    for (const sold of atomic.soldOutProducts) {
      ownerNotifyTasks.push(
        notifyStoreOwnerProductSoldOutFromOrder(sb, {
          storeId,
          orderId,
          orderNo: resolvedOrderNo,
          productId: sold.productId,
          productTitle: sold.productTitle,
          ownerUserId,
          storeName,
        })
      );
    }
  }

  if (ownerNotifyTasks.length > 0) {
    await Promise.allSettled(ownerNotifyTasks);
  }

  try {
    const ens = await ensureStoreOrderMessengerRoom(sb as SupabaseClient<any>, {
      orderId,
      userId: buyerId,
    });
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

  invalidateStoreOrderCountsCache(storeId, ownerUserId || undefined);
  if (ownerUserId) invalidateOwnerHubBadgeCache(ownerUserId);
  invalidateStoreOrderDetailSnapshot(orderId, buyerId, "order_created");
  invalidateBuyerStoreOrdersListSnapshot(buyerId, "order_created");

  return NextResponse.json({
    ok: true,
    order: { id: orderId, order_no: resolvedOrderNo, payment_amount: paymentAmount },
    idempotent: false,
  });
}
