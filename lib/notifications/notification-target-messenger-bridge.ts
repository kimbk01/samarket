/**
 * CM room → notification_targets bump/clear (badge SSOT write path).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";
import {
  bumpChatRoomTargetFromMessengerParticipant,
  bumpNotificationTarget,
  clearChatRoomTargetFromMessengerRead,
} from "@/lib/notifications/notification-targets";

type StoreOrderRoomContext = {
  storeId: string | null;
  ownerUserId: string | null;
};

async function loadStoreOrderRoomContext(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<StoreOrderRoomContext | null> {
  const rid = roomId.trim();
  if (!rid) return null;
  const { data } = await sb
    .from("store_orders")
    .select("store_id, stores(owner_user_id)")
    .eq("community_messenger_room_id", rid)
    .maybeSingle();
  if (!data || typeof data !== "object") return null;
  const row = data as { store_id?: unknown; stores?: { owner_user_id?: unknown } | Array<{ owner_user_id?: unknown }> | null };
  const storeId = typeof row.store_id === "string" ? row.store_id.trim() : null;
  const stores = row.stores;
  const store = Array.isArray(stores) ? stores[0] : stores;
  const ownerUserId =
    store && typeof store.owner_user_id === "string" ? store.owner_user_id.trim() : null;
  if (!storeId && !ownerUserId) return null;
  return { storeId, ownerUserId };
}

function messengerTargetForUser(
  userId: string,
  ctx: StoreOrderRoomContext | null
): { isOwnerOrderChat: boolean; storeId: string | null } {
  const uid = userId.trim();
  if (ctx?.ownerUserId && uid === ctx.ownerUserId) {
    return { isOwnerOrderChat: true, storeId: ctx.storeId };
  }
  return { isOwnerOrderChat: false, storeId: null };
}

export async function bumpMessengerRoomTargetsForRecipients(
  sb: SupabaseClient<any>,
  opts: { roomId: string; fromUserId: string }
): Promise<void> {
  const roomId = opts.roomId.trim();
  const fromUserId = opts.fromUserId.trim();
  if (!roomId || !fromUserId) return;

  const [{ data: participants }, orderCtx] = await Promise.all([
    sb.from("community_messenger_participants").select("user_id").eq("room_id", roomId),
    loadStoreOrderRoomContext(sb, roomId),
  ]);

  for (const row of (participants ?? []) as Array<{ user_id?: unknown }>) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid || uid === fromUserId) continue;
    const target = messengerTargetForUser(uid, orderCtx);
    await bumpChatRoomTargetFromMessengerParticipant(sb, {
      userId: uid,
      roomId,
      isOwnerOrderChat: target.isOwnerOrderChat,
      storeId: target.storeId,
    });
  }
}

export async function clearMessengerRoomNotificationTargetAfterRead(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string
): Promise<void> {
  const uid = userId.trim();
  const rid = roomId.trim();
  if (!uid || !rid) return;

  const orderCtx = await loadStoreOrderRoomContext(sb, rid);
  const target = messengerTargetForUser(uid, orderCtx);
  await clearChatRoomTargetFromMessengerRead(sb, {
    userId: uid,
    roomId: rid,
    isOwnerOrderChat: target.isOwnerOrderChat,
    storeId: target.storeId,
  });
}

export async function bumpTradeTargetForMessengerRoomRecipients(
  sb: SupabaseClient<any>,
  opts: { roomId: string; recipientUserIds: string[] }
): Promise<void> {
  const roomId = opts.roomId.trim();
  if (!roomId || !opts.recipientUserIds.length) return;

  const { data: pc } = await sb
    .from("product_chats")
    .select("post_id, seller_id, buyer_id")
    .eq("community_messenger_room_id", roomId)
    .maybeSingle();
  if (!pc || typeof pc !== "object") return;

  const postId = typeof pc.post_id === "string" ? pc.post_id.trim() : "";
  const sellerId = typeof pc.seller_id === "string" ? pc.seller_id.trim() : "";
  const buyerId = typeof pc.buyer_id === "string" ? pc.buyer_id.trim() : "";
  if (!postId || !sellerId || !buyerId) return;

  const targetId = buildTradeTargetId(postId, sellerId, buyerId);
  for (const rawUid of opts.recipientUserIds) {
    const uid = rawUid.trim();
    if (!uid) continue;
    await bumpNotificationTarget(sb, {
      userId: uid,
      targetType: "trade",
      targetId,
      scope: "consumer",
    });
  }
}
