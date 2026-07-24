/**
 * trade Domain — 공용 입력/행 타입 (Phase 3).
 * Identity: trade:{itemId}:{sellerId}:{counterpartyId} (schema buyerId ≈ counterparty)
 */
import type { DomainListSnapshot } from "@/lib/messenger/contracts/ports";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";

export { TRADE_DOMAIN };

/** schema: buyerId 는 counterparty 역할 (구매 희망자/거래 상대) */
export type TradeRoomInput = Readonly<{
  roomId: string;
  chatDomain: string | null | undefined;
  domainIdentityKey: string | null | undefined;
  itemId: string | null | undefined;
  sellerUserId: string | null | undefined;
  /** counterparty = canonical buyerId in LOCK identity */
  counterpartyUserId: string | null | undefined;
  itemTitle: string | null | undefined;
  itemImageUrl: string | null | undefined;
  peerDisplayName: string | null | undefined;
  peerAvatarUrl: string | null | undefined;
  /** Real product_chats.id when linked — not posts.id */
  productChatId?: string | null | undefined;
  lastMessage: string | null | undefined;
  lastMessageAt: string | null | undefined;
  unreadCount: number | null | undefined;
  tradeStatusLabel?: string | null | undefined;
  /** Latest message is system / status event (preview styling) */
  lastMessageIsSystem?: boolean | null | undefined;
  updatedAt?: string | null | undefined;
  /** 진단용 — ListPort 는 Domain 재판정에 사용 금지 */
  roomType?: string | null | undefined;
  directKey?: string | null | undefined;
}>;

export type TradeListItem = Readonly<{
  roomId: string;
  chatDomain: typeof TRADE_DOMAIN;
  domainIdentityKey: string;
  itemId: string;
  sellerUserId: string;
  counterpartyUserId: string;
  /** viewer-relative — null rows must be dropped before DTO */
  viewerRole: "seller" | "buyer";
  itemTitle: string;
  itemImageUrl: string | null;
  peerDisplayName: string;
  peerAvatarUrl: string | null;
  /** Real product_chats.id when linked — dock must not use itemId */
  productChatId: string | null;
  lastMessage: string;
  lastMessageIsSystem: boolean;
  lastMessageAt: string;
  unreadCount: number;
  tradeStatusLabel: string | null;
  updatedAt: string;
  generation: string;
}>;

export type TradeDomainState = Readonly<{
  domain: typeof TRADE_DOMAIN;
  generation: string;
  rows: ReadonlyArray<TradeListItem>;
}>;

export const EMPTY_TRADE_STATE: TradeDomainState = {
  domain: TRADE_DOMAIN,
  generation: "0",
  rows: [],
};

/** List/product-context only — never Room Header primary title. Matches nav_trade_product_fallback (ko). */
export const TRADE_PRODUCT_TITLE_PLACEHOLDER = "상품";
export const TRADE_PEER_PLACEHOLDER = "상대방";

export type TradeListSnapshot = DomainListSnapshot<TradeListItem>;
