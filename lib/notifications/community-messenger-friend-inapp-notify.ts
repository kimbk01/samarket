import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";

const MESSENGER_FRIENDS_HREF = "/community-messenger?section=friends";

/**
 * 친구 요청 수신 — `notifications` INSERT 로 전역 Realtime 배지·(설정 시) 톤.
 * 도메인은 `community_chat` 과 동일 스위치(`community_chat_enabled`)를 따른다.
 */
export async function notifyCommunityMessengerFriendRequestReceived(
  sb: SupabaseClient<any>,
  args: {
    addresseeUserId: string;
    requestId: string;
    requesterLabel: string;
  }
): Promise<void> {
  const uid = args.addresseeUserId.trim();
  const rid = args.requestId.trim();
  if (!uid || !rid) return;

  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    title: "새 친구 요청",
    body: `${args.requesterLabel}님이 친구 요청을 보냈습니다.`,
    link_url: MESSENGER_FRIENDS_HREF,
    domain: "community_chat",
    ref_id: rid,
    meta: {
      kind: "friend_request",
      request_id: rid,
    },
  });
}

/**
 * 친구 요청 수락 — 요청자에게 인앱 알림.
 */
export async function notifyCommunityMessengerFriendRequestAccepted(
  sb: SupabaseClient<any>,
  args: {
    requesterUserId: string;
    requestId: string;
    addresseeLabel: string;
  }
): Promise<void> {
  const uid = args.requesterUserId.trim();
  const rid = args.requestId.trim();
  if (!uid || !rid) return;

  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    title: "친구 요청이 수락되었습니다",
    body: `${args.addresseeLabel}님이 요청을 수락했습니다.`,
    link_url: MESSENGER_FRIENDS_HREF,
    domain: "community_chat",
    ref_id: rid,
    meta: {
      kind: "friend_accepted",
      request_id: rid,
    },
  });
}
