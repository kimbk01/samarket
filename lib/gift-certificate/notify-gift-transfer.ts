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
import {
  notificationCopyMeta,
  type NotificationCopyMetaInput,
} from "@/lib/notifications/notification-stored-copy";
import { isNotificationSuppressedForActor } from "@/lib/social/user-block-ssot";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function roomHref(roomId: string, transferId: string): string {
  const q = new URLSearchParams({ giftTransferId: transferId });
  return `/community-messenger/rooms/${encodeURIComponent(roomId)}?${q.toString()}`;
}

type PeerLabel = {
  /** 저장 제목·본문에 넣는 이름(대체 이름이면 받는 사람 언어로 번역된 글자) */
  name: string;
  /** meta 용 — 실제 이름이면 vars, 대체 이름이면 varKeys(E4① `peerFallback`) */
  copy: Pick<NotificationCopyMetaInput, "vars" | "varKeys">;
};

function peerLabelFrom(
  language: Parameters<typeof notifySafeT>[0],
  raw: string,
  fallbackKey: "notify_peer_fallback" | "notify_member_fallback_name"
): PeerLabel {
  if (raw) return { name: raw, copy: { vars: { name: raw } } };
  // 언어 사후 검토 E4① — 대체 이름은 vars 에 넣지 않고 키(varKeys)로 — 화면이 보는 사람 언어로 그린다.
  return { name: notifySafeT(language, fallbackKey), copy: { varKeys: { name: fallbackKey } } };
}

async function peerLabel(
  sb: SupabaseClient,
  peerUserId: string,
  language: Parameters<typeof notifySafeT>[0]
): Promise<PeerLabel> {
  const nickMap = await fetchNicknamesForUserIds(sb, [peerUserId]);
  // B-10: 대체 이름은 받는 사람 언어.
  return peerLabelFrom(language, nickMap.get(peerUserId)?.trim() || "", "notify_peer_fallback");
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
  const nickMap = await fetchNicknamesForUserIds(sb, [senderId]);
  const rawPeer = nickMap.get(senderId)?.trim() || "";
  // 4절 문구 — 아이디(@…) 대신 「회원」, 이름 없음은 「상대」
  const peer = rawPeer.startsWith("@")
    ? peerLabelFrom(language, "", "notify_member_fallback_name")
    : peerLabelFrom(language, rawPeer, "notify_peer_fallback");
  const name = peer.name;

  await appendUserNotification(sb, {
    user_id: recipientId,
    notification_type: "chat",
    title: notifySafeT(language, "notify_gift_transfer_offered_title", { vars: { name } }),
    body: notifySafeT(language, "notify_gift_transfer_offered_body", { vars: { name } }),
    link_url: roomHref(roomId, transferId),
    domain: "community_chat",
    ref_id: transferId,
    dedupe_key: `gift_transfer_offered:${transferId}`,
    push_kind: "community",
    meta: {
      kind: "gift_transfer_offered",
      ...notificationCopyMeta({
        titleKey: "notify_gift_transfer_offered_title",
        messageKey: "notify_gift_transfer_offered_body",
        ...peer.copy,
      }),
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
  const peer = await peerLabel(sb, recipientId, language);
  const name = peer.name;
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
      ...notificationCopyMeta({
        titleKey: "notify_gift_transfer_accepted_title",
        messageKey: "notify_gift_transfer_accepted_body",
        ...peer.copy,
      }),
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
  const peer = await peerLabel(sb, recipientId, language);
  const name = peer.name;
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
      ...notificationCopyMeta({
        titleKey: "notify_gift_transfer_rejected_title",
        messageKey: "notify_gift_transfer_rejected_body",
        ...peer.copy,
      }),
      gift_transfer_id: transferId,
      room_id: roomId || undefined,
      instance_id: trim(args.instanceId) || undefined,
      recipient_user_id: recipientId,
    },
  });
}

export async function notifyGiftTransferCancelled(
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

  const relation = await getBlockedRelation(recipientId, senderId);
  if (isNotificationSuppressedForActor(relation)) return;

  const language = await loadNotificationUserLanguage(sb, recipientId);
  const peer = await peerLabel(sb, senderId, language);
  const name = peer.name;
  const link =
    roomId.length > 0
      ? roomHref(roomId, transferId)
      : "/mypage/gift-certificates?tab=pending";

  await appendUserNotification(sb, {
    user_id: recipientId,
    notification_type: "chat",
    title: notifySafeT(language, "notify_gift_transfer_cancelled_title"),
    body: notifySafeT(language, "notify_gift_transfer_cancelled_body", { vars: { name } }),
    link_url: link,
    domain: "community_chat",
    ref_id: transferId,
    dedupe_key: `gift_transfer_cancelled:${transferId}`,
    push_kind: "community",
    meta: {
      kind: "gift_transfer_cancelled",
      ...notificationCopyMeta({
        titleKey: "notify_gift_transfer_cancelled_title",
        messageKey: "notify_gift_transfer_cancelled_body",
        ...peer.copy,
      }),
      gift_transfer_id: transferId,
      room_id: roomId || undefined,
      instance_id: trim(args.instanceId) || undefined,
      sender_user_id: senderId,
    },
  });
}
