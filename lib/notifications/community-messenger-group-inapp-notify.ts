import type { SupabaseClient } from "@supabase/supabase-js";
import { groupRoomIdentity } from "@/lib/chat-domain/room-identity";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { notificationCopyMeta } from "@/lib/notifications/notification-stored-copy";

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
  const rawRoomTitle = trimText(args.roomTitle);
  const rawInviterLabel = trimText(args.inviterLabel);
  const roomTitle = rawRoomTitle || notifySafeT(language, "notify_group_fallback");
  const inviterLabel = rawInviterLabel || notifySafeT(language, "notify_peer_fallback");

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
      ...notificationCopyMeta({
        titleKey: "notify_group_invite_received_title",
        messageKey: "notify_group_invite_received_body",
        // 언어 사후 검토 E4① — 대체 이름은 vars 에 넣지 않고 키(varKeys)로 — 화면이 보는 사람 언어로 그린다.
        vars: { name: rawInviterLabel || undefined, room: rawRoomTitle || undefined },
        varKeys: {
          name: rawInviterLabel ? undefined : "notify_peer_fallback",
          room: rawRoomTitle ? undefined : "notify_group_fallback",
        },
      }),
    },
    // Classified as group_message → DB requires the group domain identity (same as group message rows).
    room_identity: (() => {
      const identity = groupRoomIdentity(roomId);
      return { roomId, chatDomain: identity.domain, domainIdentityKey: identity.identityKey };
    })(),
  });
}
