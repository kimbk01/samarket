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
import {
  loadUnreadParticipantRoomRows,
  type UnreadParticipantRoomRows,
} from "@/lib/notifications/load-unread-participant-room-rows";

/** 이전 rooms 조회의 `.in("chat_domain", ["trade", "store_order"])` 와 같은 조건(메모리 적용). */
const TRADE_STORE_ORDER_CHAT_DOMAINS = new Set(["trade", "store_order"]);

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
  userId: string,
  /** S2: 배지 권위 1회 계산에서 메신저 로더와 같은 조회 결과를 나눠 쓴다(없으면 직접 조회). */
  preloaded?: Promise<UnreadParticipantRoomRows> | UnreadParticipantRoomRows
): Promise<TradeStoreOrderUnreadRoomFactsFromParticipants> {
  const uid = userId.trim();
  if (!uid) return EMPTY;

  const loaded = await (preloaded ?? loadUnreadParticipantRoomRows(sb, uid));
  if (!loaded.ok) {
    console.warn(
      loaded.stage === "rooms"
        ? "[loadTradeStoreOrderUnreadRoomFactsFromParticipants] rooms"
        : "[loadTradeStoreOrderUnreadRoomFactsFromParticipants]",
      loaded.message
    );
    return EMPTY;
  }
  const parts = loaded.parts as PartRow[];
  if (!parts.some((p) => String(p.room_id ?? "").trim())) return EMPTY;
  const rooms = (loaded.rooms as RoomRow[]).filter((r) =>
    TRADE_STORE_ORDER_CHAT_DOMAINS.has(String(r.chat_domain ?? ""))
  );

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
