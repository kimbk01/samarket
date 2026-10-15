/**
 * trade RowModel + RouterPort.
 */
import { buildChatDomainRoomHref } from "@/lib/chat-domain/ports/router-port";
import type { MessengerRouterPort } from "@/lib/messenger/contracts/ports";
import { resolveTradeListItemPreview } from "@/lib/messenger/trade/preview";
import { resolveTradePresentationFromListItem } from "@/lib/messenger/trade/presentation";
import { normalizeTradeListPreviewLine } from "@/lib/messenger/trade/item-status";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";
import type { TradeListItem } from "@/lib/messenger/trade/types";
import type { TradeListViewModel } from "@/lib/messenger/trade/ux-contract";

export const tradeRouterPort: MessengerRouterPort = {
  domain: TRADE_DOMAIN,
  buildRoomHref: ({ roomId, identityKey, returnHref }) =>
    buildChatDomainRoomHref(TRADE_DOMAIN, {
      roomId,
      domain: TRADE_DOMAIN,
      identityKey,
      from: "trade",
      returnHref,
    }),
};

export function buildTradeListViewModel(item: TradeListItem): TradeListViewModel {
  const presentation = resolveTradePresentationFromListItem(item);
  /** viewer(role 기준) 통화 문구 + 실제 message_type 라벨 — hub 와 동일 resolver */
  const preview = resolveTradeListItemPreview(item);
  const statusBadge = item.tradeStatusLabel;
  const normalized = normalizeTradeListPreviewLine({
    previewText: preview.text,
    isSystem: item.lastMessageIsSystem || preview.source === "allowed_system_message",
    statusBadgeLabel: statusBadge,
  });
  return {
    roomId: item.roomId,
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    itemId: item.itemId,
    sellerUserId: item.sellerUserId,
    buyerUserId: item.counterpartyUserId,
    viewerRole: item.viewerRole,
    productTitle: presentation.productTitle,
    productImageUrl: presentation.productImageUrl,
    peerLabel: presentation.peerLabel,
    peerAvatarUrl: item.peerAvatarUrl,
    previewText: normalized.text,
    previewIsSystemEvent: normalized.isSystemEvent,
    statusBadge,
    unreadCount: item.unreadCount,
    needsResponse: item.unreadCount > 0,
    lastMessageAt: item.lastMessageAt,
    href: tradeRouterPort.buildRoomHref({
      roomId: item.roomId,
      identityKey: item.domainIdentityKey,
    }),
  };
}

/** statusBadge 는 preview 와 분리 — Row 확장은 리스트 VM + optional badge */
export function tradeStatusBadgeSeparated(item: TradeListItem): string | null {
  return item.tradeStatusLabel;
}
