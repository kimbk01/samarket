import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { getAdminNotificationCooldownSeconds } from "@/lib/notifications/messenger-notification-cooldown";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

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
      .eq("domain", "community_chat")
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

const ROOM_HREF = (roomId: string) =>
  `/community-messenger/rooms/${encodeURIComponent(roomId)}`;

/**
 * 커뮤니티 메신저 수신자에게 인앱 알림 (쿨다운: 동일 room·수신자).
 */
export async function notifyCommunityChatInAppForRecipients(
  sb: SupabaseClient<any>,
  args: {
    roomId: string;
    senderUserId: string;
    preview: string;
    recipientUserIds: string[];
    /** 본문에 @멘션 포함 시 메타에 표시 (추후 푸시·배지 우선순위 확장용) */
    hasMention?: boolean;
  }
): Promise<void> {
  const { roomId, senderUserId, preview, recipientUserIds, hasMention } = args;
  if (!roomId || !recipientUserIds.length) return;

  const cooldownSec = await getAdminNotificationCooldownSeconds(sb, "community_chat");
  const nickMap = await fetchNicknamesForUserIds(sb, [senderUserId]);
  const senderLabel = nickMap.get(senderUserId.trim())?.trim() || null;
  const linkUrl = ROOM_HREF(roomId);
  const previewBody = preview.slice(0, 200);

  for (const uid of recipientUserIds) {
    if (!uid || uid === senderUserId) continue;
    const skip = await shouldSkipDueToCooldown(sb, uid, roomId, cooldownSec);
    if (skip) continue;

    const language = await loadNotificationUserLanguage(sb, uid);
    const title = hasMention
      ? notifySafeT(language, "notify_chat_mention_title")
      : notifySafeT(language, "notify_chat_new_message_title");
    const body =
      previewBody || notifySafeT(language, "notify_chat_message_arrived_body");

    await appendUserNotification(sb, {
      user_id: uid,
      notification_type: "chat",
      title,
      body,
      link_url: linkUrl,
      domain: "community_chat",
      ref_id: roomId,
      meta: {
        kind: "community_chat",
        room_id: roomId,
        sender_id: senderUserId,
        mention: hasMention === true,
        ...(senderLabel ? { sender_label: senderLabel } : {}),
      },
    });
  }
}
