import { resolveRoomLastMessageForViewer } from "@/lib/community-messenger/call-stub-room-tip";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { storeOrderRoomIdentity } from "@/lib/chat-domain/room-identity";
import {
  lookupStoreOrderMessengerRoomReadOnly,
  lookupStoreOrderMessengerRoomsBatchReadOnly,
} from "@/lib/admin-delivery-orders/store-order-room-lookup";
import { ADMIN_STORE_ORDER_CHAT_LIST_LIMIT } from "@/lib/admin-delivery-orders/admin-order-chat-limits";

export type AdminStoreOrderChatListRow = {
  orderId: string;
  orderNo: string;
  roomId: string;
  storeId: string;
  storeLabel: string;
  customerUserId: string;
  customerLabel: string;
  orderStatus: string;
  domainIdentityKey: string;
  lastMessage: string;
  lastMessageAt: string;
  /** R1-B C-7: linked = 주문 FK, fallback = 주문 키로 찾은 방 (읽기 전용) */
  roomSource: "linked" | "fallback";
};

type StoreOrderRow = {
  id: string;
  order_no?: string | null;
  store_id: string | null;
  buyer_user_id: string | null;
  order_status: string | null;
  community_messenger_room_id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type RoomPreview = {
  id: string;
  last_message: string | null;
  last_message_at: string | null;
  title: string | null;
};

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Lookup-only Admin reader: store_orders with community_messenger_room_id,
 * plus (R1-B C-7) recent orders whose FK is empty but a room exists under the order key
 * (`store_order:{id}` identity / direct_key, legacy `trade_order:{id}`). Never creates rooms.
 */
export async function listAdminStoreOrderChats(
  limit = ADMIN_STORE_ORDER_CHAT_LIST_LIMIT
): Promise<AdminStoreOrderChatListRow[]> {
  const sb = getSupabaseServer();
  const capped = Math.min(
    Math.max(1, Math.floor(limit) || ADMIN_STORE_ORDER_CHAT_LIST_LIMIT),
    ADMIN_STORE_ORDER_CHAT_LIST_LIMIT
  );
  const ORDER_SELECT =
    "id, order_no, store_id, buyer_user_id, order_status, community_messenger_room_id, updated_at, created_at";

  const [linkedRes, unlinkedRes] = await Promise.all([
    (sb as any)
      .from("store_orders")
      .select(ORDER_SELECT)
      .not("community_messenger_room_id", "is", null)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(capped),
    (sb as any)
      .from("store_orders")
      .select(ORDER_SELECT)
      .is("community_messenger_room_id", null)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(capped),
  ]);
  if (linkedRes.error) throw new Error(linkedRes.error.message);

  const linkedRows = ((linkedRes.data ?? []) as StoreOrderRow[]).filter(
    (row) => trim(row.community_messenger_room_id).length > 0
  );
  const unlinkedRows = (unlinkedRes.error ? [] : ((unlinkedRes.data ?? []) as StoreOrderRow[])).filter(
    (row) => !trim(row.community_messenger_room_id)
  );
  const fallbackRoomByOrder = unlinkedRows.length
    ? await lookupStoreOrderMessengerRoomsBatchReadOnly(
        sb as any,
        unlinkedRows.map((row) => row.id)
      ).catch(() => new Map<string, string>())
    : new Map<string, string>();
  const fallbackOrderIds = new Set(fallbackRoomByOrder.keys());
  const orderRows: StoreOrderRow[] = [
    ...linkedRows,
    ...unlinkedRows
      .filter((row) => fallbackRoomByOrder.has(row.id))
      .map((row) => ({ ...row, community_messenger_room_id: fallbackRoomByOrder.get(row.id) ?? null })),
  ];
  if (!orderRows.length) return [];

  const roomIds = [...new Set(orderRows.map((o) => trim(o.community_messenger_room_id)))];
  const storeIds = [...new Set(orderRows.map((o) => trim(o.store_id)).filter(Boolean))];
  const buyerIds = [...new Set(orderRows.map((o) => trim(o.buyer_user_id)).filter(Boolean))];

  const [{ data: rooms }, { data: stores }, { data: profiles }] = await Promise.all([
    (sb as any)
      .from("community_messenger_rooms")
      .select("id, last_message, last_message_at, title")
      .in("id", roomIds),
    storeIds.length
      ? (sb as any).from("stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] }),
    buyerIds.length
      ? (sb as any).from("profiles").select("id, nickname, username").in("id", buyerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const roomMap = new Map(
    ((rooms ?? []) as RoomPreview[]).map((r) => [r.id, r] as const)
  );
  const storeNameById = new Map(
    ((stores ?? []) as Array<{ id: string; store_name?: string | null }>).map((s) => [
      s.id,
      trim(s.store_name) || s.id,
    ])
  );
  const profileLabelById = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        nickname?: string | null;
        username?: string | null;
      }>
    ).map((p) => [
      p.id,
      trim(p.nickname) || trim(p.username) || `회원 ${p.id.replace(/-/g, "").slice(0, 8)}`,
    ])
  );

  const mapped = orderRows.map((order) => {
    const roomId = trim(order.community_messenger_room_id);
    const room = roomMap.get(roomId);
    const storeId = trim(order.store_id);
    const customerUserId = trim(order.buyer_user_id);
    return {
      orderId: order.id,
      orderNo: trim(order.order_no),
      roomId,
      storeId,
      storeLabel: storeId ? storeNameById.get(storeId) ?? storeId : "-",
      customerUserId,
      customerLabel: customerUserId
        ? profileLabelById.get(customerUserId) ?? customerUserId
        : "-",
      orderStatus: trim(order.order_status) || "-",
      domainIdentityKey: storeOrderRoomIdentity(order.id).identityKey,
      lastMessage: trim(resolveRoomLastMessageForViewer(room?.last_message, null)) || "-",
      lastMessageAt:
        trim(room?.last_message_at) || trim(order.updated_at) || trim(order.created_at) || "",
      roomSource: fallbackOrderIds.has(order.id) ? ("fallback" as const) : ("linked" as const),
    };
  });
  return mapped
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, capped);
}

/**
 * Lookup-only: resolve CM room id for an order. Never creates.
 * R1-B C-7: FK 가 비면 주문 키(identity → direct_key)로 조회만 한다.
 */
export async function lookupAdminStoreOrderMessengerRoomId(
  orderId: string
): Promise<string | null> {
  const id = trim(orderId);
  if (!id) return null;
  const sb = getSupabaseServer();
  const { data, error } = await (sb as any)
    .from("store_orders")
    .select("community_messenger_room_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const linked = trim((data as { community_messenger_room_id?: string | null } | null)?.community_messenger_room_id);
  if (linked) return linked;
  if (!data) return null;
  const found = await lookupStoreOrderMessengerRoomReadOnly(sb as any, id, null);
  return found.roomId;
}
