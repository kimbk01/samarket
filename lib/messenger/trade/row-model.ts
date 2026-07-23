/**
 * trade RowModel + RouterPort.
 */
import { buildChatDomainRoomHref } from "@/lib/chat-domain/ports/router-port";
import type { MessengerRouterPort } from "@/lib/messenger/contracts/ports";
import { resolveTradePreview } from "@/lib/messenger/trade/preview";
import { resolveTradePresentationFromListItem } from "@/lib/messenger/trade/presentation";
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
  const preview = resolveTradePreview({
    content: item.lastMessage,
    messageType: "text",
    isSystemAllowed: true,
  });
  return {
    roomId: item.roomId,
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    itemId: item.itemId,
    productTitle: presentation.productTitle,
    productImageUrl: presentation.productImageUrl,
    peerLabel: presentation.peerLabel,
    previewText: preview.text,
    unreadCount: item.unreadCount,
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
