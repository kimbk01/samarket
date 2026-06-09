import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function notifyCommunityMessengerGroupInviteReceived(
  sb: SupabaseClient<any>,
  args: {
    userId: string;
    roomId: string;
    roomTitle: string;
    inviterUserId: string;
    inviterLabel: string;
  }
): Promise<void> {
  const uid = trimText(args.userId);
  const roomId = trimText(args.roomId);
  if (!uid || !roomId) return;
  const language = await loadNotificationUserLanguage(sb, uid);
  const roomTitle = trimText(args.roomTitle) || notifySafeT(language, "notify_group_fallback");
  const inviterLabel = trimText(args.inviterLabel) || notifySafeT(language, "notify_peer_fallback");

  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    title: notifySafeT(language, "notify_group_invite_received_title"),
    body: notifySafeT(language, "notify_group_invite_received_body", {
      vars: { name: inviterLabel, room: roomTitle },
    }),
    link_url: `/community-messenger/rooms/${encodeURIComponent(roomId)}`,
    domain: "community_chat",
    ref_id: roomId,
    meta: {
      kind: "community_group_invite",
      room_id: roomId,
      room_title: roomTitle,
      inviter_user_id: trimText(args.inviterUserId),
      inviter_label: inviterLabel,
    },
  });
}
