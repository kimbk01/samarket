import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { buildStoreOrderMessengerRoomHref } from "@/lib/chats/surfaces/order-chat-surface";
import { buildMessengerContextMetaFromStoreOrder } from "@/lib/community-messenger/store-order-messenger-context";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  getCachedStoreIfOwner,
  peekOwnerStoreOwnershipCacheHit,
} from "@/lib/stores/owner-store-ownership-cache";
import {
  BUYER_PUBLIC_LABEL_FALLBACK,
  mapBuyerUserIdsToPublicLabels,
} from "@/lib/stores/buyer-public-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 50;

const ORDERS_SELECT =
  "id, order_no, buyer_user_id, order_status, fulfillment_type, payment_amount, community_messenger_room_id, updated_at, created_at";

type OrderRow = {
  id: string;
  order_no: string;
  buyer_user_id: string;
  order_status: string;
  fulfillment_type: string;
  payment_amount: number;
  community_messenger_room_id: string;
  updated_at: string | null;
  created_at: string;
};

/** 매장 오너 — **해당 매장 주문**에 연결된 메신저 방만 (타 매장·일반 문의 제외) */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getCachedStoreIfOwner(sb, userId, id);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  void peekOwnerStoreOwnershipCacheHit(userId, id);

  const { data: storeRow } = await sb
    .from("stores")
    .select("id, store_name")
    .eq("id", id)
    .maybeSingle();

  const storeName =
    typeof storeRow?.store_name === "string" && storeRow.store_name.trim() ?
      storeRow.store_name.trim()
    : "매장";

  const { data: orders, error: ordersErr } = await sb
    .from("store_orders")
    .select(ORDERS_SELECT)
    .eq("store_id", id)
    .not("community_messenger_room_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (ordersErr) {
    console.error("[GET store order-chats]", ordersErr);
    return NextResponse.json({ ok: false, error: ordersErr.message }, { status: 500 });
  }

  const rows = (orders ?? []) as OrderRow[];
  const roomIds = rows
    .map((o) => String(o.community_messenger_room_id ?? "").trim())
    .filter(Boolean);

  const buyerIds = rows.map((o) => String(o.buyer_user_id ?? "").trim()).filter(Boolean);

  const [buyerPublicById, partsRes, roomsRes, itemsRes] = await Promise.all([
    mapBuyerUserIdsToPublicLabels(sb, buyerIds),
    roomIds.length > 0 ?
      sb
        .from("community_messenger_participants")
        .select("room_id, unread_count")
        .eq("user_id", userId)
        .in("room_id", roomIds)
    : Promise.resolve({ data: [] as { room_id: string; unread_count: number }[], error: null }),
    roomIds.length > 0 ?
      sb
        .from("community_messenger_rooms")
        .select("id, last_message_at, last_message_preview")
        .in("id", roomIds)
    : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    rows.length > 0 ?
      sb
        .from("store_order_items")
        .select("order_id, product_title_snapshot")
        .in(
          "order_id",
          rows.map((o) => o.id)
        )
        .limit(200)
    : Promise.resolve({ data: [] as { order_id: string; product_title_snapshot: string }[], error: null }),
  ]);

  const unreadByRoom = new Map<string, number>();
  for (const p of partsRes.data ?? []) {
    const rid = String(p.room_id ?? "").trim();
    if (!rid) continue;
    unreadByRoom.set(rid, Math.max(0, Math.floor(Number(p.unread_count ?? 0) || 0)));
  }

  const roomMetaById = new Map<
    string,
    { last_message_at: string | null; last_message_preview: string | null }
  >();
  for (const r of roomsRes.data ?? []) {
    const rid = String(r.id ?? "").trim();
    if (!rid) continue;
    roomMetaById.set(rid, {
      last_message_at: typeof r.last_message_at === "string" ? r.last_message_at : null,
      last_message_preview:
        typeof r.last_message_preview === "string" ? r.last_message_preview : null,
    });
  }

  const firstItemTitleByOrder = new Map<string, string>();
  for (const it of itemsRes.data ?? []) {
    const oid = String(it.order_id ?? "").trim();
    if (!oid || firstItemTitleByOrder.has(oid)) continue;
    const title = String(it.product_title_snapshot ?? "").trim();
    if (title) firstItemTitleByOrder.set(oid, title);
  }

  const chats = rows
    .map((o) => {
      const roomId = String(o.community_messenger_room_id ?? "").trim();
      if (!roomId) return null;
      const buyerId = String(o.buyer_user_id ?? "").trim();
      const buyerLabel = buyerPublicById[buyerId] ?? BUYER_PUBLIC_LABEL_FALLBACK;
      const productTitle = firstItemTitleByOrder.get(o.id) ?? "";
      const headline =
        productTitle ?
          `${storeName} · ${productTitle}`
        : `${storeName} · 주문 ${o.order_no}`;
      const meta = roomMetaById.get(roomId);
      const contextMeta = buildMessengerContextMetaFromStoreOrder({
        storeOrderId: o.id,
        orderNo: o.order_no,
        storeId: id,
        fulfillmentType: o.fulfillment_type,
        productTitle: headline,
        paymentAmount: o.payment_amount,
        orderStatusLabel: BUYER_ORDER_STATUS_LABEL[o.order_status] ?? o.order_status,
      });
      return {
        order_id: o.id,
        order_no: o.order_no,
        room_id: roomId,
        buyer_public_label: buyerLabel,
        order_status: o.order_status,
        order_status_label: BUYER_ORDER_STATUS_LABEL[o.order_status] ?? o.order_status,
        unread_count: unreadByRoom.get(roomId) ?? 0,
        last_message_at: meta?.last_message_at ?? o.updated_at ?? o.created_at,
        last_message_preview: meta?.last_message_preview?.trim() || "주문 채팅",
        messenger_href: buildStoreOrderMessengerRoomHref(roomId, {
          contextMeta,
          entryOrigin: "delivery",
        }),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return NextResponse.json({
    ok: true as const,
    store: { id, store_name: storeName },
    chats,
  });
}
