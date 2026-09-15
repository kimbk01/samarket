/**
 * Domain trade-list DTO row → canonical UnifiedRoomListItem for MessengerChatListItem.
 * Preserves CM room id as action/navigation identity. Does not invent product_chats ids.
 */
import { serializeCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";

export type DomainTradeListRow = TradeListDto["rows"][number];

export function domainTradeListRowToUnifiedItem(row: DomainTradeListRow): UnifiedRoomListItem {
  const roomId = row.roomId.trim();
  const itemId = row.itemId.trim();
  const sellerUserId = (row.sellerUserId ?? "").trim();
  const buyerUserId = (row.buyerUserId ?? "").trim();
  const viewerRole = row.viewerRole === "buyer" ? "buyer" : "seller";
  const peerUserId = viewerRole === "buyer" ? sellerUserId || null : buyerUserId || null;
  const peerLabel = row.peerLabel?.trim() || "";
  const productTitle = row.productTitle.trim() || "거래";
  const preview = row.previewText.trim();
  const domainIdentityKey = row.domainIdentityKey.trim();

  const contextMeta = {
    v: 1 as const,
    kind: "trade" as const,
    headline: productTitle,
    thumbnailUrl: row.productImageUrl,
    postId: itemId || undefined,
    itemStateLabel: row.statusBadge?.trim() || undefined,
    roleLabel: viewerRole === "seller" ? "판매" : "구매",
    sellerId: sellerUserId || undefined,
    buyerId: buyerUserId || undefined,
    sellerDisplayName: viewerRole === "buyer" ? peerLabel || undefined : undefined,
  };

  const room: CommunityMessengerRoomSummary = {
    id: roomId,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: peerLabel || productTitle,
    subtitle: "",
    summary: serializeCommunityMessengerRoomContextMeta(contextMeta),
    avatarUrl: row.peerAvatarUrl ?? null,
    unreadCount: Math.max(0, Math.floor(Number(row.unreadCount) || 0)),
    lastMessage: preview,
    lastMessageAt: row.lastMessageAt,
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    peerUserId,
    messengerDirectKey: itemId ? `trade_item:${itemId}` : null,
    chatDomain: "trade",
    domainIdentity: domainIdentityKey || null,
    domainIdentityKey: domainIdentityKey || null,
    contextMeta,
    isArchivedByViewer: false,
  };

  return {
    room,
    preview: preview || "",
    previewKind: "message",
    callStatus: null,
    callKind: null,
    lastEventAt: row.lastMessageAt,
  };
}

/** Contract helper — action endpoints must receive CM room id only. */
export function domainTradeListRowActionRoomId(row: DomainTradeListRow): string {
  return row.roomId.trim();
}
