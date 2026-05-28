import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

const MESSENGER_FRIENDS_HREF = "/community-messenger?section=friends";

function peerLabel(raw: string, language: Awaited<ReturnType<typeof loadNotificationUserLanguage>>): string {
  const trimmed = raw.trim();
  return trimmed || notifySafeT(language, "notify_peer_fallback");
}

/**
 * 친구 요청 수신 — `notifications` INSERT 로 전역 Realtime 배지·(설정 시) 톤.
 * 도메인은 `community_chat` 과 동일 스위치(`community_chat_enabled`)를 따른다.
 */
export async function notifyCommunityMessengerFriendRequestReceived(
  sb: SupabaseClient<any>,
  args: {
    addresseeUserId: string;
    requestId: string;
    requesterUserId?: string;
    requesterLabel: string;
  }
): Promise<void> {
  const uid = args.addresseeUserId.trim();
  const rid = args.requestId.trim();
  if (!uid || !rid) return;
  const requesterId = String(args.requesterUserId ?? "").trim();
  const requesterLabel = String(args.requesterLabel ?? "").trim();
  const language = await loadNotificationUserLanguage(sb, uid);
  const name = peerLabel(requesterLabel, language);

  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    title: notifySafeT(language, "notify_friend_request_received_title"),
    body: notifySafeT(language, "notify_friend_request_received_body", { vars: { name } }),
    link_url: MESSENGER_FRIENDS_HREF,
    domain: "community_chat",
    ref_id: rid,
    meta: {
      kind: "friend_request",
      request_id: rid,
      requester_user_id: requesterId,
      requester_label: requesterLabel,
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
    addresseeUserId?: string;
  }
): Promise<void> {
  const uid = args.requesterUserId.trim();
  const rid = args.requestId.trim();
  if (!uid || !rid) return;
  const addresseeUserId = String(args.addresseeUserId ?? "").trim();
  const addresseeLabel = String(args.addresseeLabel ?? "").trim();
  const language = await loadNotificationUserLanguage(sb, uid);
  const name = peerLabel(addresseeLabel, language);

  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    title: notifySafeT(language, "notify_friend_request_accepted_title"),
    body: notifySafeT(language, "notify_friend_request_accepted_body", { vars: { name } }),
    link_url: MESSENGER_FRIENDS_HREF,
    domain: "community_chat",
    ref_id: rid,
    meta: {
      kind: "friend_accepted",
      request_id: rid,
      addressee_user_id: addresseeUserId,
      addressee_label: addresseeLabel,
    },
  });
}

/**
 * 친구 요청 거절 — 요청자에게 인앱 알림.
 */
export async function notifyCommunityMessengerFriendRequestRejected(
  sb: SupabaseClient<any>,
  args: {
    requesterUserId: string;
    requestId: string;
    addresseeLabel: string;
    addresseeUserId?: string;
  }
): Promise<void> {
  const uid = args.requesterUserId.trim();
  const rid = args.requestId.trim();
  if (!uid || !rid) return;
  const addresseeUserId = String(args.addresseeUserId ?? "").trim();
  const addresseeLabel = String(args.addresseeLabel ?? "").trim();
  const language = await loadNotificationUserLanguage(sb, uid);
  const name = peerLabel(addresseeLabel, language);

  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    title: notifySafeT(language, "notify_friend_request_rejected_title"),
    body: notifySafeT(language, "notify_friend_request_rejected_body", { vars: { name } }),
    link_url: MESSENGER_FRIENDS_HREF,
    domain: "community_chat",
    ref_id: rid,
    meta: {
      kind: "friend_rejected",
      request_id: rid,
      addressee_user_id: addresseeUserId,
      addressee_label: addresseeLabel,
    },
  });
}
