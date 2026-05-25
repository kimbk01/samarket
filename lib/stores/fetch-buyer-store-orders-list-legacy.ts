/**
 * Legacy multi-wave buyer store orders list builder — temporary fallback only (SOL1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBuyerStoreOrderMessengerUnreadMap } from "@/lib/community-messenger/store-order-chat-service";
import { loadBuyerStoreOrderReviewsByOrderIds } from "@/lib/stores/buyer-store-order-review-meta";
import {
  buildBuyerStoreOrdersListResponseBody,
  type BuyerStoreOrderListApiRow,
} from "@/lib/stores/buyer-store-orders-list-snapshot-assemble";
import { normalizeStoreOrderStatusForBuyer } from "@/lib/stores/normalize-store-order-status";
import { gateLegacyFallback } from "@/lib/ops/legacy-fallback-usage-audit";

const ORDERS_LIST_SELECT =
  "id, order_no, store_id, total_amount, payment_amount, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, delivery_user_address_id, delivery_place_id, delivery_formatted_address, delivery_detail_address, delivery_note, delivery_latitude, delivery_longitude, created_at, auto_complete_at, community_messenger_room_id, estimated_prep_minutes, estimated_ready_at, accepted_at, sla_warning_level, sla_warning_reason, sla_warning_at, needs_admin_attention, checkout_prep_minutes, checkout_ride_minutes, checkout_eta_minutes, checkout_eta_computed_at, checkout_route_distance_meters, checkout_straight_distance_meters";

export type BuyerStoreOrdersListLegacyResult = {
  body: ReturnType<typeof buildBuyerStoreOrdersListResponseBody>;
  dbMs: number;
  ordersFetchMs: number;
  wave2Ms: number;
};

export async function buildBuyerStoreOrdersListLegacy(
  sb: SupabaseClient<any>,
  buyerUserId: string,
  rowLimit: number
): Promise<
  | { ok: true; result: BuyerStoreOrdersListLegacyResult }
  | { ok: false; error: string; status: number }
> {
  gateLegacyFallback({
    route: "/api/me/store-orders",
    fallback_branch: "legacy_2_wave_list",
    reason: "unified_rpc_unavailable",
  });

  const db0 = performance.now();
  const { data: orders, error } = await sb
    .from("store_orders")
    .select(ORDERS_LIST_SELECT)
    .eq("buyer_user_id", buyerUserId)
    .order("created_at", { ascending: false })
    .limit(rowLimit);

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  const rawList = orders ?? [];
  const ordersFetchMs = Math.round(performance.now() - db0);

  if (!rawList.length) {
    return {
      ok: true,
      result: {
        body: { ok: true, orders: [] },
        dbMs: ordersFetchMs,
        ordersFetchMs,
        wave2Ms: 0,
      },
    };
  }

  const rawOrderIds = rawList.map((o) => String(o.id ?? "").trim()).filter(Boolean);
  const wave0 = performance.now();

  const [hiddenRes, itemsRes, revBundle] = await Promise.all([
    sb
      .from("store_order_buyer_hides")
      .select("order_id")
      .eq("buyer_user_id", buyerUserId)
      .in("order_id", rawOrderIds),
    sb
      .from("store_order_items")
      .select(
        "id, order_id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json"
      )
      .in("order_id", rawOrderIds),
    loadBuyerStoreOrderReviewsByOrderIds(sb, rawOrderIds),
  ]);

  let list = rawList;
  const { data: hiddenRows, error: hiddenErr } = hiddenRes;
  if (hiddenErr) {
    if (
      !(
        hiddenErr.message?.includes("store_order_buyer_hides") &&
        hiddenErr.message.includes("does not exist")
      )
    ) {
      return { ok: false, error: hiddenErr.message, status: 500 };
    }
  } else {
    const hidden = new Set(
      (hiddenRows ?? [])
        .map((r) => String((r as { order_id?: string }).order_id ?? "").trim())
        .filter(Boolean)
    );
    if (hidden.size > 0) {
      list = rawList.filter((o) => !hidden.has(String(o.id ?? "").trim()));
    }
  }

  const { data: itemRows, error: iErr } = itemsRes;
  if (iErr) {
    return { ok: false, error: iErr.message, status: 500 };
  }

  const itemsByOrder: Record<string, unknown[]> = {};
  for (const row of itemRows ?? []) {
    const oid = row.order_id as string;
    if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
    itemsByOrder[oid].push(row);
  }

  const { byOrderId: reviewsByOrderId, reviewsUnavailable } = revBundle;
  const storeIds = [...new Set(list.map((o) => o.store_id as string))];
  const orderIdsForChat = list.map((o) => String(o.id ?? "").trim()).filter(Boolean);

  const [storesRes, unreadMap] = await Promise.all([
    storeIds.length
      ? sb.from("stores").select("id, store_name, profile_image_url, slug").in("id", storeIds)
      : Promise.resolve({ data: [] as const, error: null as null }),
    getBuyerStoreOrderMessengerUnreadMap(sb, buyerUserId, orderIdsForChat),
  ]);

  const names: Record<string, string> = {};
  const profileImages: Record<string, string | null> = {};
  const slugs: Record<string, string> = {};
  for (const s of storesRes.data ?? []) {
    const sid = s.id as string;
    names[sid] = (s.store_name as string) ?? "";
    const u = s.profile_image_url;
    profileImages[sid] = typeof u === "string" && u.trim() ? u.trim() : null;
    const slugRaw = (s as { slug?: string | null }).slug;
    slugs[sid] = typeof slugRaw === "string" && slugRaw.trim() ? slugRaw.trim() : "";
  }

  const wave2Ms = Math.round(performance.now() - wave0);
  const dbMs = Math.round(performance.now() - db0);

  const ordersOut: BuyerStoreOrderListApiRow[] = list.map((o) => {
    const id = o.id as string;
    const norm = normalizeStoreOrderStatusForBuyer(o.order_status);
    const status = norm || String(o.order_status ?? "").trim() || "pending";
    const buyerReview = reviewsByOrderId.get(id) ?? null;
    const completed = status === "completed";
    const canSubmitReview = completed && !buyerReview && !reviewsUnavailable;
    const sid = o.store_id as string;
    return {
      ...(o as Record<string, unknown>),
      order_status: status,
      store_name: names[sid] ?? "",
      store_slug: slugs[sid] ?? "",
      store_profile_image_url: profileImages[sid] ?? null,
      items: (itemsByOrder[id] ?? []) as Record<string, unknown>[],
      has_review: !!buyerReview,
      review: buyerReview,
      can_submit_review: canSubmitReview,
      review_status: completed
        ? buyerReview
          ? "completed"
          : reviewsUnavailable
            ? "unavailable"
            : "pending"
        : "not_applicable",
      order_chat_unread_count: unreadMap[id] ?? 0,
    } as BuyerStoreOrderListApiRow;
  });

  return {
    ok: true,
    result: {
      body: buildBuyerStoreOrdersListResponseBody(ordersOut),
      dbMs,
      ordersFetchMs,
      wave2Ms,
    },
  };
}
