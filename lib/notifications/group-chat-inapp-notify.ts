import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { getAdminNotificationCooldownSeconds } from "@/lib/notifications/messenger-notification-cooldown";

function groupChatHref(roomId: string): string {
  return `/group-chat/${encodeURIComponent(roomId)}`;
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

/**
 * Kasama `group_rooms` / `group_messages` 축 — 수신자에게 인앱 알림 (방 밖에서도 배지·톤).
 * 도메인은 `community_chat` 설정과 동일 스위치를 쓴다(메타로 구분).
 */
export async function notifyGroupChatMessageRecipients(
  sb: SupabaseClient<any>,
  args: {
    roomId: string;
    senderUserId: string;
    preview: string;
  }
): Promise<void> {
  const roomId = args.roomId.trim();
  if (!roomId || !args.senderUserId.trim()) return;

  const { data: members, error } = await sb
    .from("group_room_members")
    .select("user_id")
    .eq("room_id", roomId);
  if (error || !members?.length) return;

  const cooldownSec = await getAdminNotificationCooldownSeconds(sb, "community_chat");
  const nickMap = await fetchNicknamesForUserIds(sb, [args.senderUserId]);
  const senderLabel = nickMap.get(args.senderUserId.trim())?.trim() || null;
  const title = "그룹 메시지";
  const body = (args.preview || "새 메시지").slice(0, 200);
  const link = groupChatHref(roomId);

  for (const row of members as { user_id?: string }[]) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid || uid === args.senderUserId) continue;

    const skip = await shouldSkipDueToCooldown(sb, uid, roomId, cooldownSec);
    if (skip) continue;

    await appendUserNotification(sb, {
      user_id: uid,
      notification_type: "chat",
      title,
      body,
      link_url: link,
      domain: "community_chat",
      ref_id: roomId,
      meta: {
        kind: "group_chat",
        room_id: roomId,
        sender_id: args.senderUserId,
        ...(senderLabel ? { sender_label: senderLabel } : {}),
      },
    });
  }
}
