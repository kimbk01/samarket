/**
 * Canonical trade + store_order unread-room Facts for App Icon / Hubs.
 *
 * CONTRACT (Badge SSOT Phase 4–5, 2026-07-31):
 * - Same participant unread_count as list row (not independent notification_targets).
 * - Active = unread_count > 0 AND left_at IS NULL AND room.deleted_at IS NULL
 *   AND last_message non-empty (exclude phantom stale counters).
 * - Trade: chat_domain = trade.
 * - Store order: chat_domain = store_order; viewer is exactly one of:
 *     customer (store_orders.buyer_user_id) OR owner (stores.owner_user_id).
 *   Same room must not contribute to both customer and owner sets.
 * - DO NOT use notification_targets as independent App Icon / Hub origin.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRoomUuidFallbackIdentityKey } from "@/lib/notifications/badge-authority-rebuild/canonical-conversation-room-identity";

export type TradeStoreOrderUnreadRoomFactsFromParticipants = Readonly<{
  tradeUnreadRoomIds: readonly string[];
  customerOrderUnreadRoomIds: readonly string[];
  ownerOrderUnreadRoomIds: readonly string[];
  ownerOrderUnreadByStoreId: Readonly<Record<string, number>>;
  domainUnreadRooms: {
    trade: number;
    store_order: number;
  };
  storeOrderBuyerDeliveryUnread: number;
  storeOrderOwnerChatUnread: number;
  rowUnreadByRoomId: Readonly<Record<string, number>>;
  /** Gate 3 Step 12 — proven domain keys only. */
  domainIdentityKeyByRoomId: Readonly<Record<string, string>>;
}>;

const EMPTY: TradeStoreOrderUnreadRoomFactsFromParticipants = {
  tradeUnreadRoomIds: [],
  customerOrderUnreadRoomIds: [],
  ownerOrderUnreadRoomIds: [],
  ownerOrderUnreadByStoreId: {},
  domainUnreadRooms: { trade: 0, store_order: 0 },
  storeOrderBuyerDeliveryUnread: 0,
  storeOrderOwnerChatUnread: 0,
  rowUnreadByRoomId: {},
  domainIdentityKeyByRoomId: {},
};

type PartRow = {
  room_id?: unknown;
  unread_count?: unknown;
  left_at?: unknown;
};

type RoomRow = {
  id?: unknown;
  chat_domain?: unknown;
  deleted_at?: unknown;
  last_message?: unknown;
  domain_identity_key?: unknown;
};

function parseOrderId(identityKey: unknown): string | null {
  const k = String(identityKey ?? "").trim();
  // Gate 3 Step 12 — never treat store_order:room:{uuid} as order id.
  if (!k.startsWith("store_order:") || k.startsWith("store_order:room:")) return null;
  const id = k.slice("store_order:".length).split(":")[0]?.trim() ?? "";
  if (!id || id === "room") return null;
  return id;
}

/**
 * Pure partition after rooms + order buyer + store owner maps are loaded.
 */
export function partitionTradeStoreOrderUnreadRoomFactsFromParticipants(input: {
  userId: string;
  parts: ReadonlyArray<PartRow>;
  rooms: ReadonlyArray<RoomRow>;
  /** orderId → buyer_user_id */
  orderBuyerById: Readonly<Record<string, string>>;
  /** storeId → owner_user_id */
  storeOwnerById: Readonly<Record<string, string>>;
  /** orderId → store_id */
  orderStoreById: Readonly<Record<string, string>>;
}): TradeStoreOrderUnreadRoomFactsFromParticipants {
  const uid = input.userId.trim();
  if (!uid) return EMPTY;

  const roomById = new Map<string, RoomRow>();
  for (const r of input.rooms) {
    const id = String(r.id ?? "").trim();
    if (id) roomById.set(id, r);
  }

  const trade = new Set<string>();
  const customer = new Set<string>();
  const owner = new Set<string>();
  const ownerByStore: Record<string, number> = {};
  const rowUnread: Record<string, number> = {};
  const domainIdentityKeyByRoomId: Record<string, string> = {};

  for (const p of input.parts) {
    const roomId = String(p.room_id ?? "").trim();
    if (!roomId) continue;
    if (p.left_at != null && String(p.left_at).trim() !== "") continue;
    const unread = Math.max(0, Math.floor(Number(p.unread_count) || 0));
    if (unread <= 0) continue;
    const room = roomById.get(roomId);
    if (!room) continue;
    if (room.deleted_at != null && String(room.deleted_at).trim() !== "") continue;
    if (room.last_message !== undefined && !String(room.last_message ?? "").trim()) continue;

    const domain = String(room.chat_domain ?? "").trim();
    const rawIdentity = String(room.domain_identity_key ?? "").trim();
    const identity =
      rawIdentity && !isRoomUuidFallbackIdentityKey(rawIdentity) ? rawIdentity : "";
    if (domain === "trade") {
      trade.add(roomId);
      rowUnread[roomId] = unread;
      if (identity) domainIdentityKeyByRoomId[roomId] = identity;
      continue;
    }
    if (domain !== "store_order") continue;

    const orderId = parseOrderId(identity || room.domain_identity_key);
    if (!orderId) continue;
    const buyerId = String(input.orderBuyerById[orderId] ?? "").trim();
    const storeId = String(input.orderStoreById[orderId] ?? "").trim();
    const ownerId = storeId ? String(input.storeOwnerById[storeId] ?? "").trim() : "";

    if (buyerId && buyerId === uid) {
      customer.add(roomId);
      rowUnread[roomId] = unread;
      if (identity) domainIdentityKeyByRoomId[roomId] = identity;
      continue;
    }
    if (ownerId && ownerId === uid) {
      owner.add(roomId);
      rowUnread[roomId] = unread;
      if (identity) domainIdentityKeyByRoomId[roomId] = identity;
      if (storeId) ownerByStore[storeId] = (ownerByStore[storeId] ?? 0) + 1;
    }
    // Inaccessible / wrong attribution → exclude
  }

  return {
    tradeUnreadRoomIds: [...trade].sort(),
    customerOrderUnreadRoomIds: [...customer].sort(),
    ownerOrderUnreadRoomIds: [...owner].sort(),
    ownerOrderUnreadByStoreId: ownerByStore,
    domainUnreadRooms: {
      trade: trade.size,
      // Diagnostic combined; App Icon uses buyer+owner Facts separately.
      store_order: customer.size + owner.size,
    },
    storeOrderBuyerDeliveryUnread: customer.size,
    storeOrderOwnerChatUnread: owner.size,
    rowUnreadByRoomId: rowUnread,
    domainIdentityKeyByRoomId,
  };
}

export async function loadTradeStoreOrderUnreadRoomFactsFromParticipants(
  sb: SupabaseClient,
  userId: string
): Promise<TradeStoreOrderUnreadRoomFactsFromParticipants> {
  const uid = userId.trim();
  if (!uid) return EMPTY;

  const { data: parts, error: partErr } = await sb
    .from("community_messenger_participants")
    .select("room_id, unread_count, left_at")
    .eq("user_id", uid)
    .gt("unread_count", 0)
    .is("left_at", null);

  if (partErr) {
    console.warn("[loadTradeStoreOrderUnreadRoomFactsFromParticipants]", partErr.message);
    return EMPTY;
  }

  const roomIds = [
    ...new Set(
      (parts ?? [])
        .map((p) => String((p as PartRow).room_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (roomIds.length === 0) return EMPTY;

  const { data: rooms, error: roomErr } = await sb
    .from("community_messenger_rooms")
    .select("id, chat_domain, deleted_at, last_message, domain_identity_key")
    .in("id", roomIds)
    .in("chat_domain", ["trade", "store_order"]);

  if (roomErr) {
    console.warn("[loadTradeStoreOrderUnreadRoomFactsFromParticipants] rooms", roomErr.message);
    return EMPTY;
  }

  const orderIds = [
    ...new Set(
      (rooms ?? [])
        .map((r) => parseOrderId((r as RoomRow).domain_identity_key))
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const orderBuyerById: Record<string, string> = {};
  const orderStoreById: Record<string, string> = {};
  if (orderIds.length > 0) {
    const { data: orders, error: ordErr } = await sb
      .from("store_orders")
      .select("id, buyer_user_id, store_id")
      .in("id", orderIds);
    if (ordErr) {
      console.warn("[loadTradeStoreOrderUnreadRoomFactsFromParticipants] orders", ordErr.message);
    } else {
      for (const o of orders ?? []) {
        const id = String(o.id ?? "").trim();
        if (!id) continue;
        orderBuyerById[id] = String(o.buyer_user_id ?? "").trim();
        orderStoreById[id] = String(o.store_id ?? "").trim();
      }
    }
  }

  const storeIds = [...new Set(Object.values(orderStoreById).filter(Boolean))];
  const storeOwnerById: Record<string, string> = {};
  if (storeIds.length > 0) {
    const { data: stores, error: stErr } = await sb
      .from("stores")
      .select("id, owner_user_id")
      .in("id", storeIds);
    if (stErr) {
      console.warn("[loadTradeStoreOrderUnreadRoomFactsFromParticipants] stores", stErr.message);
    } else {
      for (const s of stores ?? []) {
        const id = String(s.id ?? "").trim();
        if (!id) continue;
        storeOwnerById[id] = String(s.owner_user_id ?? "").trim();
      }
    }
  }

  return partitionTradeStoreOrderUnreadRoomFactsFromParticipants({
    userId: uid,
    parts: (parts ?? []) as PartRow[],
    rooms: (rooms ?? []) as RoomRow[],
    orderBuyerById,
    storeOwnerById,
    orderStoreById,
  });
}
