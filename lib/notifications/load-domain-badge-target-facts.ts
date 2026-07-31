/**
 * P2-a — Domain badge target facts in ONE notification_targets SELECT.
 *
 * Used for trade / store_order (and legacy chat_room target rows).
 * Messenger Bottom GD+Group counts are NOT taken from this loader alone —
 * `loadMessengerUnreadRoomFactsFromParticipants` is the product SSOT for those axes
 * (Phase A: targets lagged participant unread → Bottom 2 vs list 4).
 *
 * DO NOT add Hub API merge or new migrations here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE } from "@/lib/messenger/contracts/chat-room-unread-from-notification-targets";
import { TRADE_UNREAD_TARGET_TYPE } from "@/lib/messenger/trade/unread-from-notification-targets";
import {
  STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
  STORE_ORDER_OWNER_UNREAD_TARGET_TYPE,
  parseStoreOrderOrderIdFromIdentityKey,
} from "@/lib/messenger/store-order/unread-from-notification-targets";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";

export type DomainBadgeTargetRow = Readonly<{
  target_id?: string | null;
  domain_identity_key?: string | null;
  chat_domain?: string | null;
  target_type?: string | null;
  is_unread?: boolean | null;
  scope?: string | null;
}>;

export type DomainBadgeTargetFacts = Readonly<{
  domainUnreadRooms: {
    general_direct: number;
    group: number;
    trade: number;
    store_order: number;
  };
  storeOrderBuyerDeliveryUnread: number;
  storeOrderOwnerChatUnread: number;
}>;

const TARGET_TYPES = [
  MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE,
  TRADE_UNREAD_TARGET_TYPE,
  STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
  STORE_ORDER_OWNER_UNREAD_TARGET_TYPE,
] as const;

/**
 * Pure partition — same filters as the five legacy loaders (parity LOCK).
 */
export function partitionDomainBadgeTargetFacts(
  rows: ReadonlyArray<DomainBadgeTargetRow>
): DomainBadgeTargetFacts {
  const gd = new Set<string>();
  const group = new Set<string>();
  const trade = new Set<string>();
  const buyer = new Set<string>();
  const ownerRooms = new Set<string>();
  const ownerOrders = new Set<string>();

  for (const row of rows) {
    if (row.is_unread === false) continue;
    const targetType = String(row.target_type ?? "").trim();
    const domain = String(row.chat_domain ?? "").trim();
    const scope = String(row.scope ?? "").trim();
    const targetId = String(row.target_id ?? "").trim();
    const identity = String(row.domain_identity_key ?? "").trim();

    if (targetType === MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE) {
      if (scope !== "consumer") continue;
      if (!targetId) continue;
      if (domain === "general_direct") gd.add(targetId);
      else if (domain === "group") group.add(targetId);
      continue;
    }

    if (targetType === TRADE_UNREAD_TARGET_TYPE) {
      if (scope !== "consumer") continue;
      if (domain !== "trade") continue;
      if (identity) trade.add(identity);
      continue;
    }

    if (targetType === STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE) {
      if (domain !== STORE_ORDER_DOMAIN) continue;
      if (targetId) buyer.add(targetId);
      continue;
    }

    if (targetType === STORE_ORDER_OWNER_UNREAD_TARGET_TYPE) {
      if (domain !== STORE_ORDER_DOMAIN) continue;
      if (targetId) ownerRooms.add(targetId);
      const orderId = parseStoreOrderOrderIdFromIdentityKey(identity);
      if (orderId) ownerOrders.add(orderId);
    }
  }

  const storeOrderAttention = new Set<string>();
  for (const id of buyer) storeOrderAttention.add(`buyer:${id}`);
  for (const id of ownerRooms) storeOrderAttention.add(`owner_room:${id}`);
  for (const id of ownerOrders) storeOrderAttention.add(`owner_order:${id}`);

  return {
    domainUnreadRooms: {
      general_direct: gd.size,
      group: group.size,
      trade: trade.size,
      store_order: storeOrderAttention.size,
    },
    storeOrderBuyerDeliveryUnread: buyer.size,
    storeOrderOwnerChatUnread: ownerRooms.size,
  };
}

export async function loadDomainBadgeTargetFacts(
  sb: SupabaseClient,
  userId: string
): Promise<DomainBadgeTargetFacts> {
  const uid = userId.trim();
  if (!uid) {
    return {
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
      storeOrderBuyerDeliveryUnread: 0,
      storeOrderOwnerChatUnread: 0,
    };
  }

  const { data, error } = await sb
    .from("notification_targets")
    .select("target_id, domain_identity_key, chat_domain, target_type, is_unread, scope")
    .eq("user_id", uid)
    .eq("is_unread", true)
    .in("target_type", [...TARGET_TYPES]);

  if (error) {
    console.warn("[loadDomainBadgeTargetFacts]", error.message);
    return {
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
      storeOrderBuyerDeliveryUnread: 0,
      storeOrderOwnerChatUnread: 0,
    };
  }

  return partitionDomainBadgeTargetFacts((data ?? []) as DomainBadgeTargetRow[]);
}
