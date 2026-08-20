import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { storeOrderRoomIdentity } from "@/lib/chat-domain/room-identity";

export type AdminStoreOrderChatListRow = {
  orderId: string;
  roomId: string;
  storeId: string;
  storeLabel: string;
  customerUserId: string;
  customerLabel: string;
  orderStatus: string;
  domainIdentityKey: string;
  lastMessage: string;
  lastMessageAt: string;
};

type StoreOrderRow = {
  id: string;
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
 * Lookup-only Admin reader: store_orders with community_messenger_room_id.
 * Never ensures / creates rooms.
 */
export async function listAdminStoreOrderChats(limit = 200): Promise<AdminStoreOrderChatListRow[]> {
  const sb = getSupabaseServer();
  const capped = Math.min(Math.max(1, Math.floor(limit) || 200), 200);

  const { data: orders, error } = await (sb as any)
    .from("store_orders")
    .select(
      "id, store_id, buyer_user_id, order_status, community_messenger_room_id, updated_at, created_at"
    )
    .not("community_messenger_room_id", "is", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(capped);
  if (error) throw new Error(error.message);

  const orderRows = ((orders ?? []) as StoreOrderRow[]).filter(
    (row) => trim(row.community_messenger_room_id).length > 0
  );
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

  return orderRows.map((order) => {
    const roomId = trim(order.community_messenger_room_id);
    const room = roomMap.get(roomId);
    const storeId = trim(order.store_id);
    const customerUserId = trim(order.buyer_user_id);
    return {
      orderId: order.id,
      roomId,
      storeId,
      storeLabel: storeId ? storeNameById.get(storeId) ?? storeId : "-",
      customerUserId,
      customerLabel: customerUserId
        ? profileLabelById.get(customerUserId) ?? customerUserId
        : "-",
      orderStatus: trim(order.order_status) || "-",
      domainIdentityKey: storeOrderRoomIdentity(order.id).identityKey,
      lastMessage: trim(room?.last_message) || "-",
      lastMessageAt:
        trim(room?.last_message_at) || trim(order.updated_at) || trim(order.created_at) || "",
    };
  });
}

/** Lookup-only: resolve CM room id for an order. Never creates. */
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
  const roomId = trim((data as { community_messenger_room_id?: string | null } | null)?.community_messenger_room_id);
  return roomId || null;
}
