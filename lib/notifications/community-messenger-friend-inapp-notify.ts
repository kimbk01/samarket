import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

/** 받은 친구 요청 화면 — 친구 탭 + 받은 요청 시트 */
export const CM_FRIEND_REQUESTS_INBOX_LINK = "/community-messenger?section=friends&friendRequests=received";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 같은 요청·같은 날 1회 — 거절 뒤 반복 재요청으로 알림이 쌓이지 않게 한다. */
function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 친구 요청을 받은 사람에게 알림함·푸시 1건 (앱 밖·다른 화면 수신용).
 * 앱 안 실시간 중앙 팝업은 `community_friend_requests` Realtime 이 따로 띄운다.
 */
export async function notifyCommunityMessengerFriendRequestReceived(
  sb: SupabaseClient<any>,
  args: { addresseeUserId: string; requesterUserId: string; requesterLabel: string; requestId: string }
): Promise<void> {
  const uid = trimText(args.addresseeUserId);
  const requesterId = trimText(args.requesterUserId);
  const requestId = trimText(args.requestId);
  if (!uid || !requesterId || !requestId) return;
  const language = await loadNotificationUserLanguage(sb, uid);
  const name = trimText(args.requesterLabel) || notifySafeT(language, "notify_peer_fallback");
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "status",
    push_kind: "community",
    title: notifySafeT(language, "notify_friend_request_received_title"),
    body: notifySafeT(language, "notify_friend_request_received_body", { vars: { name } }),
    link_url: CM_FRIEND_REQUESTS_INBOX_LINK,
    ref_id: requestId,
    sender_id: requesterId,
    dedupe_key: `cm_friend_request:${requestId}:${dayBucket()}`,
    meta: { kind: "friend_request", request_id: requestId, actor_id: requesterId },
  });
}

/** 요청을 보낸 사람에게 「수락」 알림 1건. */
export async function notifyCommunityMessengerFriendRequestAccepted(
  sb: SupabaseClient<any>,
  args: { requesterUserId: string; accepterUserId: string; accepterLabel: string; requestId: string }
): Promise<void> {
  const uid = trimText(args.requesterUserId);
  const accepterId = trimText(args.accepterUserId);
  const requestId = trimText(args.requestId);
  if (!uid || !accepterId || !requestId) return;
  const language = await loadNotificationUserLanguage(sb, uid);
  const name = trimText(args.accepterLabel) || notifySafeT(language, "notify_peer_fallback");
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "status",
    push_kind: "community",
    title: notifySafeT(language, "notify_friend_request_accepted_title"),
    body: notifySafeT(language, "notify_friend_request_accepted_body", { vars: { name } }),
    link_url: "/community-messenger?section=friends",
    ref_id: requestId,
    sender_id: accepterId,
    dedupe_key: `cm_friend_accepted:${requestId}:${dayBucket()}`,
    meta: { kind: "friend_accepted", request_id: requestId, actor_id: accepterId },
  });
}
