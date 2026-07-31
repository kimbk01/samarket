/**
 * Heal derived trade / store_order badge projection from canonical participant unread.
 *
 * DO NOT delete messages / rooms / read cursors / status notification_events.
 * Only adjusts:
 * - phantom participant unread_count → 0 (trade / store_order, empty last_message)
 * - notification_targets trade / buyer_order / owner_order_chat to match participant Facts
 *
 * Targets remain derived projection only — App Icon / Hub Facts = participants loader.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";
import { loadTradeStoreOrderUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants";
import {
  bumpNotificationTarget,
  clearNotificationTarget,
} from "@/lib/notifications/notification-targets";
import { TRADE_UNREAD_TARGET_TYPE } from "@/lib/messenger/trade/unread-from-notification-targets";
import {
  STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
  STORE_ORDER_OWNER_UNREAD_TARGET_TYPE,
  parseStoreOrderOrderIdFromIdentityKey,
} from "@/lib/messenger/store-order/unread-from-notification-targets";

export type TradeStoreOrderBadgeHealResult = Readonly<{
  phantomUnreadCleared: number;
  tradeTargetsBumped: number;
  tradeTargetsCleared: number;
  buyerTargetsBumped: number;
  buyerTargetsCleared: number;
  ownerChatTargetsBumped: number;
  ownerChatTargetsCleared: number;
  canonicalTrade: number;
  canonicalCustomerOrder: number;
  canonicalOwnerOrder: number;
}>;

function parseTradeListingId(identityKey: unknown): string | null {
  const k = String(identityKey ?? "").trim();
  if (!k.startsWith("trade:")) return null;
  const listing = k.slice("trade:".length).split(":")[0]?.trim() ?? "";
  return listing || null;
}

export async function healTradeStoreOrderBadgeDerivedFromParticipants(
  sb: SupabaseClient,
  userId: string
): Promise<TradeStoreOrderBadgeHealResult> {
  const uid = userId.trim();
  const empty: TradeStoreOrderBadgeHealResult = {
    phantomUnreadCleared: 0,
    tradeTargetsBumped: 0,
    tradeTargetsCleared: 0,
    buyerTargetsBumped: 0,
    buyerTargetsCleared: 0,
    ownerChatTargetsBumped: 0,
    ownerChatTargetsCleared: 0,
    canonicalTrade: 0,
    canonicalCustomerOrder: 0,
    canonicalOwnerOrder: 0,
  };
  if (!uid) return empty;

  // 1) Phantom unread clear for trade / store_order
  const { data: parts } = await sb
    .from("community_messenger_participants")
    .select("room_id, unread_count, left_at")
    .eq("user_id", uid)
    .gt("unread_count", 0)
    .is("left_at", null);
  const partIds = [
    ...new Set((parts ?? []).map((p) => String(p.room_id ?? "").trim()).filter(Boolean)),
  ];
  let phantomUnreadCleared = 0;
  if (partIds.length > 0) {
    const { data: rooms } = await sb
      .from("community_messenger_rooms")
      .select("id, chat_domain, last_message, deleted_at")
      .in("id", partIds);
    const phantoms = (rooms ?? []).filter((r) => {
      const domain = String(r.chat_domain ?? "").trim();
      if (domain !== "trade" && domain !== "store_order") return false;
      if (r.deleted_at) return false;
      return !String(r.last_message ?? "").trim();
    });
    for (const room of phantoms) {
      const rid = String(room.id ?? "").trim();
      if (!rid) continue;
      const { error } = await sb
        .from("community_messenger_participants")
        .update({ unread_count: 0 })
        .eq("user_id", uid)
        .eq("room_id", rid)
        .gt("unread_count", 0);
      if (!error) phantomUnreadCleared += 1;
    }
  }

  const facts = await loadTradeStoreOrderUnreadRoomFactsFromParticipants(sb, uid);
  const tradeRooms = new Set(facts.tradeUnreadRoomIds);
  const customerRooms = new Set(facts.customerOrderUnreadRoomIds);
  const ownerRooms = new Set(facts.ownerOrderUnreadRoomIds);

  // Room metadata for bump keys
  const allCanonicalRooms = [...tradeRooms, ...customerRooms, ...ownerRooms];
  const roomMeta = new Map<
    string,
    { domain_identity_key: string | null; chat_domain: string | null }
  >();
  if (allCanonicalRooms.length > 0) {
    const { data: rooms } = await sb
      .from("community_messenger_rooms")
      .select("id, domain_identity_key, chat_domain")
      .in("id", allCanonicalRooms);
    for (const r of rooms ?? []) {
      const id = String(r.id ?? "").trim();
      if (!id) continue;
      roomMeta.set(id, {
        domain_identity_key: (r.domain_identity_key as string | null) ?? null,
        chat_domain: (r.chat_domain as string | null) ?? null,
      });
    }
  }

  // --- Trade targets (domain_identity_key presence; target_id from product_chats) ---
  let tradeTargetsBumped = 0;
  let tradeTargetsCleared = 0;
  const canonicalTradeIdentities = new Set<string>();
  for (const roomId of tradeRooms) {
    const meta = roomMeta.get(roomId);
    const identity = String(meta?.domain_identity_key ?? "").trim();
    if (identity) canonicalTradeIdentities.add(identity);
  }

  const { data: tradeTargets } = await sb
    .from("notification_targets")
    .select("target_id, domain_identity_key, is_unread")
    .eq("user_id", uid)
    .eq("target_type", TRADE_UNREAD_TARGET_TYPE)
    .eq("scope", "consumer");

  const tradeUnreadByIdentity = new Set<string>();
  for (const row of tradeTargets ?? []) {
    const identity = String(row.domain_identity_key ?? "").trim();
    const tid = String(row.target_id ?? "").trim();
    if (row.is_unread !== true) continue;
    if (identity) tradeUnreadByIdentity.add(identity);
    if (identity && !canonicalTradeIdentities.has(identity)) {
      await clearNotificationTarget(sb, {
        userId: uid,
        targetType: TRADE_UNREAD_TARGET_TYPE,
        targetId: tid,
      });
      tradeTargetsCleared += 1;
    }
  }

  for (const roomId of tradeRooms) {
    const meta = roomMeta.get(roomId);
    const identity = String(meta?.domain_identity_key ?? "").trim();
    if (identity && tradeUnreadByIdentity.has(identity)) continue;

    const { data: pc } = await sb
      .from("product_chats")
      .select("post_id, seller_id, buyer_id")
      .eq("community_messenger_room_id", roomId)
      .maybeSingle();

    let targetId = "";
    if (pc && typeof pc === "object") {
      const postId = typeof pc.post_id === "string" ? pc.post_id.trim() : "";
      const sellerId = typeof pc.seller_id === "string" ? pc.seller_id.trim() : "";
      const buyerId = typeof pc.buyer_id === "string" ? pc.buyer_id.trim() : "";
      if (postId && sellerId && buyerId) {
        targetId = buildTradeTargetId(postId, sellerId, buyerId);
      }
    }
    if (!targetId) {
      // Fallback from domain_identity_key trade:{listing}:{a}:{b}
      const parts = identity.split(":");
      if (parts.length >= 4 && parts[0] === "trade") {
        targetId = buildTradeTargetId(parts[1]!, parts[2]!, parts[3]!);
      } else {
        const listing = parseTradeListingId(identity);
        if (listing) targetId = listing;
      }
    }
    if (!targetId) continue;

    await bumpNotificationTarget(sb, {
      userId: uid,
      targetType: TRADE_UNREAD_TARGET_TYPE,
      targetId,
      scope: "consumer",
      roomId,
    });
    tradeTargetsBumped += 1;
  }

  // --- Customer buyer_order (target_id = order_id) ---
  let buyerTargetsBumped = 0;
  let buyerTargetsCleared = 0;
  const canonicalOrderIds = new Set<string>();
  const orderIdByRoom = new Map<string, string>();
  for (const roomId of customerRooms) {
    const meta = roomMeta.get(roomId);
    const orderId = parseStoreOrderOrderIdFromIdentityKey(meta?.domain_identity_key);
    if (orderId) {
      canonicalOrderIds.add(orderId);
      orderIdByRoom.set(roomId, orderId);
    }
  }

  const { data: buyerTargets } = await sb
    .from("notification_targets")
    .select("target_id, is_unread")
    .eq("user_id", uid)
    .eq("target_type", STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE);

  const buyerUnread = new Set<string>();
  for (const row of buyerTargets ?? []) {
    const tid = String(row.target_id ?? "").trim();
    if (!tid || row.is_unread !== true) continue;
    buyerUnread.add(tid);
    if (!canonicalOrderIds.has(tid)) {
      await clearNotificationTarget(sb, {
        userId: uid,
        targetType: STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
        targetId: tid,
      });
      buyerTargetsCleared += 1;
    }
  }

  for (const roomId of customerRooms) {
    const orderId = orderIdByRoom.get(roomId);
    if (!orderId || buyerUnread.has(orderId)) continue;
    await bumpNotificationTarget(sb, {
      userId: uid,
      targetType: STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
      targetId: orderId,
      scope: "consumer",
      roomId,
    });
    buyerTargetsBumped += 1;
  }

  // --- Owner owner_order_chat (target_id = room_id) ---
  let ownerChatTargetsBumped = 0;
  let ownerChatTargetsCleared = 0;
  const { data: ownerTargets } = await sb
    .from("notification_targets")
    .select("target_id, is_unread, store_id")
    .eq("user_id", uid)
    .eq("target_type", STORE_ORDER_OWNER_UNREAD_TARGET_TYPE);

  const ownerUnreadRooms = new Set<string>();
  for (const row of ownerTargets ?? []) {
    const tid = String(row.target_id ?? "").trim();
    if (!tid || row.is_unread !== true) continue;
    ownerUnreadRooms.add(tid);
    if (!ownerRooms.has(tid)) {
      await clearNotificationTarget(sb, {
        userId: uid,
        targetType: STORE_ORDER_OWNER_UNREAD_TARGET_TYPE,
        targetId: tid,
        storeId: (row.store_id as string | null) ?? null,
      });
      ownerChatTargetsCleared += 1;
    }
  }

  for (const roomId of ownerRooms) {
    if (ownerUnreadRooms.has(roomId)) continue;
    const orderId = parseStoreOrderOrderIdFromIdentityKey(
      roomMeta.get(roomId)?.domain_identity_key
    );
    let storeId: string | null = null;
    if (orderId) {
      const { data: ord } = await sb
        .from("store_orders")
        .select("store_id")
        .eq("id", orderId)
        .maybeSingle();
      storeId = typeof ord?.store_id === "string" ? ord.store_id : null;
    }
    await bumpNotificationTarget(sb, {
      userId: uid,
      targetType: STORE_ORDER_OWNER_UNREAD_TARGET_TYPE,
      targetId: roomId,
      scope: "owner_store",
      storeId,
      roomId,
    });
    ownerChatTargetsBumped += 1;
  }

  return {
    phantomUnreadCleared,
    tradeTargetsBumped,
    tradeTargetsCleared,
    buyerTargetsBumped,
    buyerTargetsCleared,
    ownerChatTargetsBumped,
    ownerChatTargetsCleared,
    canonicalTrade: facts.domainUnreadRooms.trade,
    canonicalCustomerOrder: facts.storeOrderBuyerDeliveryUnread,
    canonicalOwnerOrder: facts.storeOrderOwnerChatUnread,
  };
}
