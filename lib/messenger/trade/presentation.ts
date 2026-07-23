/**
 * trade Presentation — 상품 이미지·명·거래 상대. general_direct surface fallback 금지.
 */
import type { DomainDisplayIdentity } from "@/lib/messenger/contracts/ports";
import { assertTradeOwnedRoom } from "@/lib/messenger/trade/identity";
import {
  TRADE_DOMAIN,
  TRADE_PEER_PLACEHOLDER,
  TRADE_PRODUCT_TITLE_PLACEHOLDER,
  type TradeListItem,
} from "@/lib/messenger/trade/types";

export type TradePresentationInput = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  itemTitle: string | null | undefined;
  itemImageUrl: string | null | undefined;
  peerDisplayName: string | null | undefined;
  /** 금지 — general_direct 만으로 표면 구성 */
  useGeneralDirectSurfaceOnly?: boolean;
  storeName?: string | null;
  groupName?: string | null;
}>;

export type TradePresentationModel = Readonly<{
  productTitle: string;
  productImageUrl: string | null;
  peerLabel: string;
  display: DomainDisplayIdentity;
}>;

export function resolveTradePresentation(input: TradePresentationInput): TradePresentationModel {
  assertTradeOwnedRoom({
    roomId: input.roomId,
    chatDomain: input.chatDomain as "trade",
    domainIdentityKey: input.domainIdentityKey,
  });
  if (input.useGeneralDirectSurfaceOnly) {
    throw new Error("dibay_trade_general_direct_surface_forbidden");
  }
  if (input.storeName?.trim() || input.groupName?.trim()) {
    throw new Error("dibay_trade_foreign_presentation_forbidden");
  }
  const productTitle = input.itemTitle?.trim() || TRADE_PRODUCT_TITLE_PLACEHOLDER;
  if (!input.itemTitle?.trim()) {
    console.warn("[trade-display-identity]", { reason: "missing_item_title", roomId: input.roomId });
  }
  const peerLabel = input.peerDisplayName?.trim() || TRADE_PEER_PLACEHOLDER;
  return {
    productTitle,
    productImageUrl: input.itemImageUrl?.trim() || null,
    peerLabel,
    display: {
      title: productTitle,
      avatarUrl: input.itemImageUrl?.trim() || null,
      usedPeerUserFallback: false,
    },
  };
}

export function resolveTradePresentationFromListItem(item: TradeListItem): TradePresentationModel {
  return resolveTradePresentation({
    roomId: item.roomId,
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    itemTitle: item.itemTitle,
    itemImageUrl: item.itemImageUrl,
    peerDisplayName: item.peerDisplayName,
  });
}
