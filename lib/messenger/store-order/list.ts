/**
 * StoreOrderListPort — store_order 방만 · 주문당 1행. 매장 단위 병합 금지.
 */
import {
  assertStoreOrderIdentityKey,
  buildStoreOrderIdentityKey,
  STORE_ORDER_DOMAIN,
} from "@/lib/messenger/store-order/design-lock";
import {
  STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER,
  STORE_ORDER_STORE_NAME_PLACEHOLDER,
  type StoreOrderListItem,
  type StoreOrderListSnapshot,
  type StoreOrderRoomInput,
} from "@/lib/messenger/store-order/types";

export type StoreOrderListPortResult =
  | { ok: true; snapshot: StoreOrderListSnapshot }
  | { ok: false; error: string };

function trimOrEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function rejectForeignOrInvalid(row: StoreOrderRoomInput): string | null {
  const domain = trimOrEmpty(row.chatDomain);
  const identityKey = trimOrEmpty(row.domainIdentityKey);
  if (!domain) return "dibay_store_order_domain_missing";
  if (domain === "general_direct" || domain === "group" || domain === "trade") {
    return `dibay_store_order_rejects_${domain}`;
  }
  if (domain !== STORE_ORDER_DOMAIN) return "dibay_store_order_domain_mismatch";
  if (!identityKey) return "dibay_store_order_identity_missing";
  try {
    assertStoreOrderIdentityKey(identityKey);
  } catch (e) {
    return e instanceof Error ? e.message : "dibay_store_order_identity_invalid";
  }
  if (!trimOrEmpty(row.roomId)) return "dibay_store_order_room_id_required";
  if (!trimOrEmpty(row.orderId)) return "dibay_store_order_order_id_required";
  const expected = buildStoreOrderIdentityKey(trimOrEmpty(row.orderId));
  if (identityKey !== expected) return "dibay_store_order_identity_order_mismatch";
  return null;
}

export function mapStoreOrderListItem(row: StoreOrderRoomInput, generation: string): StoreOrderListItem {
  const err = rejectForeignOrInvalid(row);
  if (err) throw new Error(err);
  return {
    roomId: trimOrEmpty(row.roomId),
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: trimOrEmpty(row.domainIdentityKey),
    orderId: trimOrEmpty(row.orderId),
    storeId: trimOrEmpty(row.storeId) || null,
    storeName: trimOrEmpty(row.storeName) || STORE_ORDER_STORE_NAME_PLACEHOLDER,
    storeImageUrl: trimOrEmpty(row.storeImageUrl) || null,
    customerUserId: trimOrEmpty(row.customerUserId) || null,
    customerName: trimOrEmpty(row.customerName) || STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER,
    customerAvatarUrl: trimOrEmpty(row.customerAvatarUrl) || null,
    latestChatMessageText: trimOrEmpty(row.latestChatMessageText),
    latestChatMessageType: trimOrEmpty(row.latestChatMessageType) || "text",
    latestChatMessageAt: trimOrEmpty(row.latestChatMessageAt),
    unreadCount: Math.max(0, Math.floor(Number(row.unreadCount) || 0)),
    orderStatusLabel: trimOrEmpty(row.orderStatusLabel) || null,
    fulfillmentType: trimOrEmpty(row.fulfillmentType) || null,
    generation,
  };
}

export function buildStoreOrderListSnapshot(input: {
  viewerUserId: string;
  generation: string;
  rooms: ReadonlyArray<StoreOrderRoomInput>;
}): StoreOrderListPortResult {
  const viewerUserId = input.viewerUserId.trim();
  if (!viewerUserId) return { ok: false, error: "dibay_store_order_viewer_required" };
  const generation = input.generation.trim() || "0";
  const seenIdentity = new Map<string, string>();
  const rows: StoreOrderListItem[] = [];

  for (const room of input.rooms) {
    const foreign = rejectForeignOrInvalid(room);
    if (foreign) return { ok: false, error: foreign };
    let item: StoreOrderListItem;
    try {
      item = mapStoreOrderListItem(room, generation);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "dibay_store_order_list_map_failed" };
    }
    const prev = seenIdentity.get(item.domainIdentityKey);
    if (prev && prev !== item.roomId) {
      return { ok: false, error: `dibay_store_order_duplicate_identity:${item.domainIdentityKey}` };
    }
    seenIdentity.set(item.domainIdentityKey, item.roomId);
    rows.push(item);
  }

  return {
    ok: true,
    snapshot: { domain: STORE_ORDER_DOMAIN, viewerUserId, generation, rows },
  };
}
