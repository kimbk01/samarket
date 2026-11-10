/**
 * Domain store-order customer list DTO row → canonical UnifiedRoomListItem for MessengerChatListItem
 * (`listVisual="delivery"`). CM room id stays the action/navigation identity.
 */
import { guardRawCmListPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import { serializeCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import type { SoCustomerListDto } from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import { isStoreOrderBuyerHideAllowedStatus } from "@/lib/stores/store-order-process-model";

export type DomainStoreOrderListRow = SoCustomerListDto["rows"][number];

/** 고객 나가기 허용 = 끝난 주문(완료·취소·환불)만. 상태를 모르면(옛 캐시) 허용하지 않는다. */
export function domainStoreOrderListRowLeaveAllowed(row: Pick<DomainStoreOrderListRow, "orderStatus">): boolean {
  const status = row.orderStatus?.trim() ?? "";
  return status ? isStoreOrderBuyerHideAllowedStatus(status) : false;
}

export function domainStoreOrderListRowToUnifiedItem(
  row: DomainStoreOrderListRow,
  viewerUserId: string
): UnifiedRoomListItem {
  const roomId = row.roomId.trim();
  const orderId = row.orderId.trim();
  const storeName = row.storeName.trim();
  const preview = guardRawCmListPreviewText(row.previewText, viewerUserId || null).trim();
  const domainIdentityKey = row.domainIdentityKey.trim();

  const contextMeta = {
    v: 1 as const,
    kind: "delivery" as const,
    headline: storeName,
    storeOrderId: orderId || undefined,
    storeId: row.storeId?.trim() || undefined,
    storeDisplayName: storeName || undefined,
    storeProfileImageUrl: row.storeImageUrl ?? null,
    orderStatus: row.orderStatus?.trim() || undefined,
    fulfillmentType: row.fulfillmentType?.trim() || undefined,
    stepLabel: row.statusBadge?.trim() || undefined,
  };

  const room: CommunityMessengerRoomSummary = {
    id: roomId,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: storeName,
    subtitle: "",
    summary: serializeCommunityMessengerRoomContextMeta(contextMeta),
    avatarUrl: row.storeImageUrl ?? null,
    unreadCount: Math.max(0, Math.floor(Number(row.unreadCount) || 0)),
    isMuted: Boolean(row.isMuted),
    lastMessage: preview,
    lastMessageAt: row.lastMessageAt,
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    peerUserId: null,
    messengerDirectKey: orderId ? `store_order:${orderId}` : null,
    chatDomain: "store_order",
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
