/**
 * CM room → notification_targets bump/clear (badge SSOT write path).
 *
 * DO NOT: trade/delivery CM 방에 consumer `chat_room` bump — bottom_nav_chat 는 general 만.
 * trade → `trade` target, delivery customer → `buyer_order`, delivery owner → `owner_order_chat`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";
import {
  bumpChatRoomTargetFromMessengerParticipant,
  bumpNotificationTarget,
  clearChatRoomTargetFromMessengerRead,
  clearNotificationTarget,
} from "@/lib/notifications/notification-targets";

type StoreOrderRoomContext = {
  orderId: string;
  storeId: string | null;
  ownerUserId: string | null;
};

type MessengerRoomBadgeKind = "general" | "trade" | "delivery";

async function loadStoreOrderRoomContext(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<StoreOrderRoomContext | null> {
  const rid = roomId.trim();
  if (!rid) return null;
  const { data } = await sb
    .from("store_orders")
    .select("id, store_id, stores(owner_user_id)")
    .eq("community_messenger_room_id", rid)
    .maybeSingle();
  if (!data || typeof data !== "object") return null;
  const row = data as {
    id?: unknown;
    store_id?: unknown;
    stores?: { owner_user_id?: unknown } | Array<{ owner_user_id?: unknown }> | null;
  };
  const orderId = typeof row.id === "string" ? row.id.trim() : "";
  if (!orderId) return null;
  const storeId = typeof row.store_id === "string" ? row.store_id.trim() : null;
  const stores = row.stores;
  const store = Array.isArray(stores) ? stores[0] : stores;
  const ownerUserId =
    store && typeof store.owner_user_id === "string" ? store.owner_user_id.trim() : null;
  return { orderId, storeId, ownerUserId };
}

async function loadMessengerRoomDirectKey(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<string | null> {
  const rid = roomId.trim();
  if (!rid) return null;
  const { data } = await sb
    .from("community_messenger_rooms")
    .select("direct_key")
    .eq("id", rid)
    .maybeSingle();
  if (!data || typeof data !== "object") return null;
  const dk = (data as { direct_key?: unknown }).direct_key;
  return typeof dk === "string" ? dk.trim() || null : null;
}

function orderIdFromDirectKey(directKey: string | null | undefined): string | null {
  const dk = directKey?.trim() ?? "";
  if (dk.startsWith("store_order:")) {
    const id = dk.slice("store_order:".length).trim();
    return id || null;
  }
  if (dk.startsWith("trade_order:")) {
    const id = dk.slice("trade_order:".length).trim();
    return id || null;
  }
  return null;
}

function resolveMessengerRoomBadgeKind(
  orderCtx: StoreOrderRoomContext | null,
  directKey: string | null
): MessengerRoomBadgeKind {
  if (orderCtx?.orderId) return "delivery";
  const dk = directKey?.trim() ?? "";
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return "trade";
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) return "delivery";
  return "general";
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

async function bumpDeliveryTargetForRecipient(
  sb: SupabaseClient<any>,
  opts: {
    userId: string;
    roomId: string;
    orderCtx: StoreOrderRoomContext | null;
    directKey: string | null;
  }
): Promise<void> {
  const uid = opts.userId.trim();
  const rid = opts.roomId.trim();
  if (!uid || !rid) return;
  const ownerTarget = messengerTargetForUser(uid, opts.orderCtx);
  if (ownerTarget.isOwnerOrderChat) {
    await bumpChatRoomTargetFromMessengerParticipant(sb, {
      userId: uid,
      roomId: rid,
      isOwnerOrderChat: true,
      storeId: ownerTarget.storeId,
    });
    return;
  }
  const orderId = opts.orderCtx?.orderId ?? orderIdFromDirectKey(opts.directKey);
  if (!orderId) return;
  await bumpNotificationTarget(sb, {
    userId: uid,
    targetType: "buyer_order",
    targetId: orderId,
    scope: "consumer",
  });
}

async function clearDeliveryTargetForRecipient(
  sb: SupabaseClient<any>,
  opts: {
    userId: string;
    roomId: string;
    orderCtx: StoreOrderRoomContext | null;
    directKey: string | null;
  }
): Promise<void> {
  const uid = opts.userId.trim();
  const rid = opts.roomId.trim();
  if (!uid || !rid) return;
  const ownerTarget = messengerTargetForUser(uid, opts.orderCtx);
  if (ownerTarget.isOwnerOrderChat) {
    await clearChatRoomTargetFromMessengerRead(sb, {
      userId: uid,
      roomId: rid,
      isOwnerOrderChat: true,
      storeId: ownerTarget.storeId,
    });
    return;
  }
  const orderId = opts.orderCtx?.orderId ?? orderIdFromDirectKey(opts.directKey);
  if (!orderId) return;
  await clearNotificationTarget(sb, {
    userId: uid,
    targetType: "buyer_order",
    targetId: orderId,
  });
}

async function clearTradeTargetForMessengerRoomUser(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string
): Promise<void> {
  const uid = userId.trim();
  const rid = roomId.trim();
  if (!uid || !rid) return;

  const { data: pc } = await sb
    .from("product_chats")
    .select("post_id, seller_id, buyer_id")
    .eq("community_messenger_room_id", rid)
    .maybeSingle();
  if (!pc || typeof pc !== "object") return;

  const postId = typeof pc.post_id === "string" ? pc.post_id.trim() : "";
  const sellerId = typeof pc.seller_id === "string" ? pc.seller_id.trim() : "";
  const buyerId = typeof pc.buyer_id === "string" ? pc.buyer_id.trim() : "";
  if (!postId || !sellerId || !buyerId) return;

  await clearNotificationTarget(sb, {
    userId: uid,
    targetType: "trade",
    targetId: buildTradeTargetId(postId, sellerId, buyerId),
  });
}

export async function bumpMessengerRoomTargetsForRecipients(
  sb: SupabaseClient<any>,
  opts: { roomId: string; fromUserId: string }
): Promise<void> {
  const roomId = opts.roomId.trim();
  const fromUserId = opts.fromUserId.trim();
  if (!roomId || !fromUserId) return;

  const [{ data: participants }, orderCtx, directKey] = await Promise.all([
    sb.from("community_messenger_participants").select("user_id").eq("room_id", roomId),
    loadStoreOrderRoomContext(sb, roomId),
    loadMessengerRoomDirectKey(sb, roomId),
  ]);

  const kind = resolveMessengerRoomBadgeKind(orderCtx, directKey);

  for (const row of (participants ?? []) as Array<{ user_id?: unknown }>) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid || uid === fromUserId) continue;

    if (kind === "trade") {
      await bumpTradeTargetForMessengerRoomRecipients(sb, {
        roomId,
        recipientUserIds: [uid],
        senderUserId: fromUserId,
      });
      continue;
    }
    if (kind === "delivery") {
      await bumpDeliveryTargetForRecipient(sb, { userId: uid, roomId, orderCtx, directKey });
      continue;
    }
    await bumpChatRoomTargetFromMessengerParticipant(sb, {
      userId: uid,
      roomId,
      isOwnerOrderChat: false,
      storeId: null,
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

  const [orderCtx, directKey] = await Promise.all([
    loadStoreOrderRoomContext(sb, rid),
    loadMessengerRoomDirectKey(sb, rid),
  ]);
  const kind = resolveMessengerRoomBadgeKind(orderCtx, directKey);

  if (kind === "trade") {
    await clearTradeTargetForMessengerRoomUser(sb, uid, rid);
    return;
  }
  if (kind === "delivery") {
    await clearDeliveryTargetForRecipient(sb, { userId: uid, roomId: rid, orderCtx, directKey });
    return;
  }
  await clearChatRoomTargetFromMessengerRead(sb, {
    userId: uid,
    roomId: rid,
    isOwnerOrderChat: false,
    storeId: null,
  });
}

export async function bumpTradeTargetForMessengerRoomRecipients(
  sb: SupabaseClient<any>,
  opts: { roomId: string; recipientUserIds: string[]; senderUserId?: string | null }
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
      actorUserId: opts.senderUserId ?? null,
    });
  }
}
