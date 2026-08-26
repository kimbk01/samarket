/**
 * U3 — gift transfer lifecycle in-app notifications (no private chat body copy).
 * Writers go through appendUserNotification SSOT only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { getBlockedRelation } from "@/lib/community-messenger/social-relations";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { isNotificationSuppressedForActor } from "@/lib/social/user-block-ssot";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function roomHref(roomId: string, transferId: string): string {
  const q = new URLSearchParams({ giftTransferId: transferId });
  return `/community-messenger/rooms/${encodeURIComponent(roomId)}?${q.toString()}`;
}

async function peerLabel(
  sb: SupabaseClient,
  peerUserId: string
): Promise<string> {
  const nickMap = await fetchNicknamesForUserIds(sb, [peerUserId]);
  return nickMap.get(peerUserId)?.trim() || notifySafeT("ko", "notify_peer_fallback");
}

export async function notifyGiftTransferOffered(
  sb: SupabaseClient,
  args: {
    recipientUserId: string;
    senderUserId: string;
    transferId: string;
    roomId: string;
    instanceId: string;
  }
): Promise<void> {
  const recipientId = trim(args.recipientUserId);
  const senderId = trim(args.senderUserId);
  const transferId = trim(args.transferId);
  const roomId = trim(args.roomId);
  if (!recipientId || !senderId || !transferId || !roomId || recipientId === senderId) return;

  const relation = await getBlockedRelation(recipientId, senderId);
  if (isNotificationSuppressedForActor(relation)) return;

  const language = await loadNotificationUserLanguage(sb, recipientId);
  const name = await peerLabel(sb, senderId);

  await appendUserNotification(sb, {
    user_id: recipientId,
    notification_type: "chat",
    title: notifySafeT(language, "notify_gift_transfer_offered_title"),
    body: notifySafeT(language, "notify_gift_transfer_offered_body", { vars: { name } }),
    link_url: roomHref(roomId, transferId),
    domain: "community_chat",
    ref_id: transferId,
    dedupe_key: `gift_transfer_offered:${transferId}`,
    push_kind: "community",
    meta: {
      kind: "gift_transfer_offered",
      gift_transfer_id: transferId,
      room_id: roomId,
      instance_id: trim(args.instanceId) || undefined,
      sender_user_id: senderId,
    },
  });
}

export async function notifyGiftTransferAccepted(
  sb: SupabaseClient,
  args: {
    senderUserId: string;
    recipientUserId: string;
    transferId: string;
    roomId: string | null;
    instanceId: string;
  }
): Promise<void> {
  const senderId = trim(args.senderUserId);
  const recipientId = trim(args.recipientUserId);
  const transferId = trim(args.transferId);
  const roomId = trim(args.roomId);
  if (!senderId || !recipientId || !transferId || senderId === recipientId) return;

  const relation = await getBlockedRelation(senderId, recipientId);
  if (isNotificationSuppressedForActor(relation)) return;

  const language = await loadNotificationUserLanguage(sb, senderId);
  const name = await peerLabel(sb, recipientId);
  const link =
    roomId.length > 0
      ? roomHref(roomId, transferId)
      : "/mypage/gift-certificates?tab=sent";

  await appendUserNotification(sb, {
    user_id: senderId,
    notification_type: "chat",
    title: notifySafeT(language, "notify_gift_transfer_accepted_title"),
    body: notifySafeT(language, "notify_gift_transfer_accepted_body", { vars: { name } }),
    link_url: link,
    domain: "community_chat",
    ref_id: transferId,
    dedupe_key: `gift_transfer_accepted:${transferId}`,
    push_kind: "community",
    meta: {
      kind: "gift_transfer_accepted",
      gift_transfer_id: transferId,
      room_id: roomId || undefined,
      instance_id: trim(args.instanceId) || undefined,
      recipient_user_id: recipientId,
    },
  });
}

export async function notifyGiftTransferRejected(
  sb: SupabaseClient,
  args: {
    senderUserId: string;
    recipientUserId: string;
    transferId: string;
    roomId: string | null;
    instanceId: string;
  }
): Promise<void> {
  const senderId = trim(args.senderUserId);
  const recipientId = trim(args.recipientUserId);
  const transferId = trim(args.transferId);
  const roomId = trim(args.roomId);
  if (!senderId || !recipientId || !transferId || senderId === recipientId) return;

  const relation = await getBlockedRelation(senderId, recipientId);
  if (isNotificationSuppressedForActor(relation)) return;

  const language = await loadNotificationUserLanguage(sb, senderId);
  const name = await peerLabel(sb, recipientId);
  const link =
    roomId.length > 0
      ? roomHref(roomId, transferId)
      : "/mypage/gift-certificates?tab=sent";

  await appendUserNotification(sb, {
    user_id: senderId,
    notification_type: "chat",
    title: notifySafeT(language, "notify_gift_transfer_rejected_title"),
    body: notifySafeT(language, "notify_gift_transfer_rejected_body", { vars: { name } }),
    link_url: link,
    domain: "community_chat",
    ref_id: transferId,
    dedupe_key: `gift_transfer_rejected:${transferId}`,
    push_kind: "community",
    meta: {
      kind: "gift_transfer_rejected",
      gift_transfer_id: transferId,
      room_id: roomId || undefined,
      instance_id: trim(args.instanceId) || undefined,
      recipient_user_id: recipientId,
    },
  });
}
