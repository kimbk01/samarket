/**
 * Phase 3 Trade — UX + ViewModel 계약 (구현 승인 전 타입만).
 *
 * UX (변경 금지):
 * 채팅 홈 거래채팅 허브 → 거래채팅 전용 리스트 → 거래채팅방
 * 거래방은 일반 메신저 목록에 직접 나열하지 않음.
 */
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";

export type TradeHubViewModel = Readonly<{
  domain: typeof TRADE_DOMAIN;
  /** 허브 행 제목 카피 키/문구는 UI 기존 유지 — Domain 은 count·preview 만 */
  roomCount: number;
  unreadCount: number;
  /** 가장 최근 거래방의 실제 최신 메시지 preview */
  previewText: string;
  lastEventAt: string | null;
  /** 동일 TradeSnapshot.rows 에서 선택된 최신 방 — List[0]과 정합 */
  latestRoomId: string | null;
  latestDomainIdentityKey: string | null;
  hrefToTradeList: string;
}>;

export type TradeListViewModel = Readonly<{
  roomId: string;
  chatDomain: typeof TRADE_DOMAIN;
  domainIdentityKey: string;
  /** trade:{itemId}:{sellerId}:{counterpartyId} */
  itemId: string;
  productTitle: string;
  productImageUrl: string | null;
  peerLabel: string | null;
  previewText: string;
  unreadCount: number;
  lastMessageAt: string;
  href: string;
}>;

export type TradeRoomHeaderViewModel = Readonly<{
  kind: "trade";
  /** Room Header primary = viewer-relative counterparty */
  peerLabel: string;
  peerAvatarUrl: string | null;
  /** Product stays in list + in-room context — not Room Header primary */
  productTitle: string;
  productImageUrl: string | null;
  itemId: string;
  /** Real product_chats.id — optional until ledger link exists */
  productChatId: string | null;
  /** general_peer / store buyer_store 등 금지 */
  forbidsGeneralDirectHeader: true;
}>;

export const TRADE_PHASE3_UX_RULES = [
  "home_shows_single_trade_hub_not_trade_rows",
  "hub_navigates_to_trade_only_list",
  "list_one_row_per_trade_room_not_per_message",
  "same_peers_different_item_separate_rows",
  "row_shows_product_image_title_peer_latest_message",
  "forbids_general_direct_row_model",
  "room_header_trade_presentation_only",
  "forbids_general_direct_header_fallback",
  "unread_excluded_from_messenger_nav_badge",
] as const;

export const TRADE_LIST_HREF = "/community-messenger/trade-chats" as const;
