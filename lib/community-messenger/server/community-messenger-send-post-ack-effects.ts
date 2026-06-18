/**
 * MP-AUDIT-14 — send ACK 직후가 아닌 `after()` 에서만 실행할 부수효과.
 * 알림·거래 미러·배지 캐시 무효화는 POST 200 ACK 에 합산하지 않는다.
 */
import { invalidateCmBootstrapSnapshotCache } from "@/lib/community-messenger/cm-bootstrap-snapshot-cache";
import { invalidateFullBootstrapSnapshotCache } from "@/lib/community-messenger/full-bootstrap-snapshot-cache";
import { invalidateHomeSyncSnapshotCache } from "@/lib/community-messenger/home-sync-snapshot-cache";
import { invalidateRoomBootstrapSnapshotCache } from "@/lib/community-messenger/room-bootstrap-snapshot-cache";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { notifyCommunityChatInAppForRecipients } from "@/lib/notifications/community-chat-inapp-notify";
import { mirrorCommunityMessengerTextToItemTradeLedger } from "@/lib/trade/mirror-community-messenger-text-to-item-trade-ledger";
import { cmMessagePreviewFallback } from "@/lib/community-messenger/cm-service-copy";
import { isBlockedEitherWayActive } from "@/lib/community-messenger/social-relations";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

type SupabaseLike = ReturnType<typeof getSupabaseServer>;

export type CommunityMessengerSendPostAckEffects = {
  roomId: string;
  senderUserId: string;
  content: string;
  recipientUserIds: string[];
  createdAt: string;
  itemTradeLedgerId: string | null;
};

function dedupeIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function invalidateOwnerHubBadgeForCommunityMessengerPeers(
  senderUserId: string,
  recipientUserIds: string[],
  roomId?: string
): void {
  for (const id of dedupeIds([senderUserId, ...recipientUserIds])) {
    invalidateOwnerHubBadgeCache(id);
    invalidateHomeSyncSnapshotCache(id);
    invalidateCmBootstrapSnapshotCache(id);
    invalidateFullBootstrapSnapshotCache(id, "peer_hub_invalidate");
  }
  const rid = roomId?.trim() ?? "";
  if (rid) {
    invalidateRoomBootstrapSnapshotCache(rid, dedupeIds([senderUserId, ...recipientUserIds]));
  }
}

export async function runCommunityMessengerSendPostAckEffects(
  sb: SupabaseLike,
  effects: CommunityMessengerSendPostAckEffects
): Promise<void> {
  const roomId = effects.roomId.trim();
  const senderUserId = effects.senderUserId.trim();
  const content = effects.content;
  const recipientUserIds = effects.recipientUserIds;
  if (effects.itemTradeLedgerId) {
    await mirrorCommunityMessengerTextToItemTradeLedger(sb, {
      itemTradeChatRoomId: effects.itemTradeLedgerId,
      senderUserId,
      textContent: content,
      createdAt: effects.createdAt,
    }).catch(() => {});
  }
  const preview = cmMessagePreviewFallback(content);
  const eligibleRecipients: string[] = [];
  for (const uid of recipientUserIds) {
    const trimmed = uid.trim();
    if (!trimmed || trimmed === senderUserId) continue;
    if (await isBlockedEitherWayActive(trimmed, senderUserId, sb)) continue;
    eligibleRecipients.push(trimmed);
  }
  await notifyCommunityChatInAppForRecipients(sb, {
    roomId,
    senderUserId,
    preview,
    recipientUserIds: eligibleRecipients,
    hasMention: /@\S/.test(content),
  }).catch(() => {});
  invalidateOwnerHubBadgeForCommunityMessengerPeers(senderUserId, eligibleRecipients, roomId);
}
