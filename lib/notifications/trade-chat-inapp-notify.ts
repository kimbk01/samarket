import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";
import { bumpNotificationTarget } from "@/lib/notifications/notification-targets";
import { bumpTradeTargetForMessengerRoomRecipients } from "@/lib/notifications/notification-target-messenger-bridge";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { getAdminNotificationCooldownSeconds } from "@/lib/notifications/messenger-notification-cooldown";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";

async function shouldSkipDueToCooldown(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string,
  cooldownSec: number
): Promise<boolean> {
  if (cooldownSec <= 0) return false;
  try {
    const since = new Date(Date.now() - cooldownSec * 1000).toISOString();
    const { data, error } = await sb
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("domain", "trade_chat")
      .eq("ref_id", roomId)
      .gte("created_at", since)
      .limit(1);
    if (error) {
      if (error.message?.includes("domain") || error.message?.includes("column")) {
        return false;
      }
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function bumpTradeTargetForLegacyChatRoom(
  sb: SupabaseClient<any>,
  roomId: string,
  recipientUserIds: string[]
): Promise<void> {
  const rid = roomId.trim();
  if (!rid || !recipientUserIds.length) return;
  const { data } = await sb
    .from("chat_rooms")
    .select("item_id, seller_id, buyer_id, community_messenger_room_id, room_type")
    .eq("id", rid)
    .maybeSingle();
  if (!data || typeof data !== "object") return;
  const row = data as {
    item_id?: unknown;
    seller_id?: unknown;
    buyer_id?: unknown;
    community_messenger_room_id?: unknown;
    room_type?: unknown;
  };
  if (String(row.room_type ?? "") !== "item_trade") return;
  const cmLink = typeof row.community_messenger_room_id === "string" ? row.community_messenger_room_id.trim() : "";
  if (cmLink) return;
  const postId = typeof row.item_id === "string" ? row.item_id.trim() : "";
  const sellerId = typeof row.seller_id === "string" ? row.seller_id.trim() : "";
  const buyerId = typeof row.buyer_id === "string" ? row.buyer_id.trim() : "";
  if (!postId || !sellerId || !buyerId) return;
  const targetId = buildTradeTargetId(postId, sellerId, buyerId);
  for (const rawUid of recipientUserIds) {
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

/**
 * 거래 채팅 수신자에게 인앱 알림 1건 (쿨다운: 동일 room·수신자 기준 admin 설정 초 내 1회).
 */
export async function notifyTradeChatInAppForRecipients(
  sb: SupabaseClient<any>,
  args: {
    roomId: string;
    senderUserId: string;
    preview: string;
    recipientUserIds: string[];
  }
): Promise<void> {
  const { roomId, senderUserId, preview, recipientUserIds } = args;
  if (!roomId || !recipientUserIds.length) return;

  const cooldownSec = await getAdminNotificationCooldownSeconds(sb, "trade_chat");
  const nickMap = await fetchNicknamesForUserIds(sb, [senderUserId]);
  const senderLabel = nickMap.get(senderUserId.trim())?.trim() || null;
  const linkUrl = tradeChatNotificationHref(roomId, "chat_room");

  const bumpedRecipients: string[] = [];
  for (const uid of recipientUserIds) {
    if (!uid || uid === senderUserId) continue;
    const skip = await shouldSkipDueToCooldown(sb, uid, roomId, cooldownSec);
    if (skip) continue;

    const language = await loadNotificationUserLanguage(sb, uid);
    const title = notifySafeT(language, "notify_chat_new_message_title");
    const body =
      preview.slice(0, 200) || notifySafeT(language, "notify_chat_message_arrived_body");

    await appendUserNotification(sb, {
      user_id: uid,
      notification_type: "chat",
      title,
      body,
      link_url: linkUrl,
      domain: "trade_chat",
      ref_id: roomId,
      meta: {
        kind: "trade_chat",
        room_id: roomId,
        sender_id: senderUserId,
        ...(senderLabel ? { sender_label: senderLabel } : {}),
      },
    });
    bumpedRecipients.push(uid);
  }

  if (bumpedRecipients.length) {
    await bumpTradeTargetForMessengerRoomRecipients(sb, { roomId, recipientUserIds: bumpedRecipients });
    await bumpTradeTargetForLegacyChatRoom(sb, roomId, bumpedRecipients);
  }
}
