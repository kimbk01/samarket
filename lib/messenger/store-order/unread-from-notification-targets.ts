/**
 * Store-order List/Hub unread SSOT = notification_targets room rows
 * (customer: buyer_order · owner: owner_order_chat) — same axis as hub-bundle delivery/store_order.
 *
 * DO NOT use community_messenger_participants.unread_count for list/hub badges:
 * that counter stays >0 on completed old orders and diverges from targets (measured 29 vs 1).
 *
 * target_id semantics (do not mix):
 * - buyer_order → order_id
 * - owner_order_chat → room_id (community_messenger_rooms.id);
 *   also accept store_order:{orderId} from domain_identity_key
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";

export const STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE = "buyer_order" as const;
export const STORE_ORDER_OWNER_UNREAD_TARGET_TYPE = "owner_order_chat" as const;

/** Customer list/hub — buyer_order.target_id === orderId. */
export function resolveStoreOrderListUnreadCount(input: {
  orderId: string;
  unreadTargetOrderIds: ReadonlySet<string>;
}): number {
  const id = input.orderId.trim();
  if (!id) return 0;
  return input.unreadTargetOrderIds.has(id) ? 1 : 0;
}

export type StoreOrderOwnerUnreadTargetIndex = Readonly<{
  /** owner_order_chat.target_id */
  roomIds: ReadonlySet<string>;
  /** parsed from domain_identity_key store_order:{orderId} */
  orderIds: ReadonlySet<string>;
}>;

export function parseStoreOrderOrderIdFromIdentityKey(
  domainIdentityKey: string | null | undefined
): string | null {
  const key = String(domainIdentityKey ?? "").trim();
  if (!key.startsWith(`${STORE_ORDER_DOMAIN}:`)) return null;
  const orderId = key.slice(STORE_ORDER_DOMAIN.length + 1).trim();
  return orderId || null;
}

/** Build owner match index — roomId primary, orderId from identity as secondary. */
export function buildStoreOrderOwnerUnreadTargetIndex(
  rows: ReadonlyArray<{
    target_id?: string | null;
    domain_identity_key?: string | null;
  }>
): StoreOrderOwnerUnreadTargetIndex {
  const roomIds = new Set<string>();
  const orderIds = new Set<string>();
  for (const row of rows) {
    const roomId = String(row.target_id ?? "").trim();
    if (roomId) roomIds.add(roomId);
    const orderId = parseStoreOrderOrderIdFromIdentityKey(row.domain_identity_key);
    if (orderId) orderIds.add(orderId);
  }
  return { roomIds, orderIds };
}

/**
 * Owner list/hub — match roomId (target_id) or orderId (identity).
 * DO NOT treat owner target_id as orderId (customer-only semantics).
 */
export function resolveStoreOrderOwnerListUnreadCount(input: {
  orderId: string;
  roomId: string;
  index: StoreOrderOwnerUnreadTargetIndex;
}): number {
  const roomId = input.roomId.trim();
  const orderId = input.orderId.trim();
  if (roomId && input.index.roomIds.has(roomId)) return 1;
  if (orderId && input.index.orderIds.has(orderId)) return 1;
  return 0;
}

/** @deprecated name kept for customer call sites — loads buyer_order target_ids (order ids). */
export async function loadStoreOrderUnreadTargetOrderIds(
  sb: SupabaseClient,
  input: {
    viewerUserId: string;
    targetType: typeof STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE | typeof STORE_ORDER_OWNER_UNREAD_TARGET_TYPE;
  }
): Promise<ReadonlySet<string>> {
  const uid = input.viewerUserId.trim();
  if (!uid) return new Set();
  const { data, error } = await sb
    .from("notification_targets")
    .select("target_id")
    .eq("user_id", uid)
    .eq("target_type", input.targetType)
    .eq("is_unread", true)
    .eq("chat_domain", STORE_ORDER_DOMAIN);
  if (error) {
    console.warn("[loadStoreOrderUnreadTargetOrderIds]", error.message);
    return new Set();
  }
  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ target_id: string | null }>) {
    const id = String(row.target_id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

export async function loadStoreOrderOwnerUnreadTargetIndex(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<StoreOrderOwnerUnreadTargetIndex> {
  const uid = viewerUserId.trim();
  if (!uid) return { roomIds: new Set(), orderIds: new Set() };
  const { data, error } = await sb
    .from("notification_targets")
    .select("target_id, domain_identity_key")
    .eq("user_id", uid)
    .eq("target_type", STORE_ORDER_OWNER_UNREAD_TARGET_TYPE)
    .eq("is_unread", true)
    .eq("chat_domain", STORE_ORDER_DOMAIN);
  if (error) {
    console.warn("[loadStoreOrderOwnerUnreadTargetIndex]", error.message);
    return { roomIds: new Set(), orderIds: new Set() };
  }
  return buildStoreOrderOwnerUnreadTargetIndex(
    (data ?? []) as Array<{ target_id: string | null; domain_identity_key: string | null }>
  );
}
