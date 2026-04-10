import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

async function getCooldownSeconds(sb: SupabaseClient<any>): Promise<number> {
  try {
    const { data } = await sb
      .from("admin_notification_settings")
      .select("cooldown_seconds")
      .eq("type", "trade_chat")
      .maybeSingle();
    const n = Number((data as { cooldown_seconds?: number } | null)?.cooldown_seconds);
    if (Number.isFinite(n) && n >= 0) return Math.min(600, n);
  } catch {
    /* ignore */
  }
  return 3;
}

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

  const cooldownSec = await getCooldownSeconds(sb);
  const title = "새 메시지";
  const body = preview.slice(0, 200) || "메시지가 도착했습니다.";
  const linkUrl = tradeChatNotificationHref(roomId, "chat_room");

  for (const uid of recipientUserIds) {
    if (!uid || uid === senderUserId) continue;
    const skip = await shouldSkipDueToCooldown(sb, uid, roomId, cooldownSec);
    if (skip) continue;

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
      },
    });
  }
}
