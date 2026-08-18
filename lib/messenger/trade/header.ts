/**
 * trade HeaderPort — trade 전용. general/store_order/group Header 거부.
 */
import type { DomainHeaderKind } from "@/lib/messenger/contracts/ports";
import { assertTradeOwnedRoom } from "@/lib/messenger/trade/identity";
import { resolveTradePresentationFromListItem } from "@/lib/messenger/trade/presentation";
import { TRADE_DOMAIN, type TradeListItem } from "@/lib/messenger/trade/types";
import type { TradeRoomHeaderViewModel } from "@/lib/messenger/trade/ux-contract";

export function resolveTradeHeaderKind(input: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): DomainHeaderKind {
  if (input.chatDomain !== TRADE_DOMAIN) {
    throw new Error(`dibay_trade_header_rejects:${input.chatDomain}`);
  }
  assertTradeOwnedRoom({
    roomId: input.roomId,
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  return "trade";
}

export function buildTradeHeaderModel(
  item: TradeListItem,
  extras?: { statusOrPriceLabel?: string | null; viewerUserId?: string | null }
): TradeRoomHeaderViewModel & { statusOrPriceLabel: string | null } {
  resolveTradeHeaderKind(item);
  const p = resolveTradePresentationFromListItem(item);
  const viewer = extras?.viewerUserId?.trim() || "";
  // Self must never appear as Room Header peer (secondary) identity.
  if (viewer && (viewer === item.sellerUserId || viewer === item.counterpartyUserId)) {
    const expectedPeer =
      viewer === item.sellerUserId ? item.counterpartyUserId : item.sellerUserId;
    if (!expectedPeer || expectedPeer === viewer) {
      throw new Error("dibay_trade_header_self_peer_forbidden");
    }
  }
  return {
    kind: "trade",
    peerLabel: p.peerLabel,
    peerAvatarUrl: item.peerAvatarUrl?.trim() || null,
    productTitle: p.productTitle,
    productImageUrl: p.productImageUrl,
    itemId: item.itemId,
    productChatId: item.productChatId?.trim() || null,
    forbidsGeneralDirectHeader: true,
    statusOrPriceLabel: extras?.statusOrPriceLabel?.trim() || item.tradeStatusLabel,
  };
}
