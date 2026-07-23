/**
 * store_order UX ViewModel 계약 (Phase 4 Port 구현 전 타입·href 고정).
 * trade UX 타입을 상속·재사용하지 않음.
 */
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";

export type StoreOrderHubViewModel = Readonly<{
  domain: typeof STORE_ORDER_DOMAIN;
  roomCount: number;
  unreadCount: number;
  /** 가장 최근 주문방의 실제 최신 채팅 메시지 preview */
  previewText: string;
  lastEventAt: string | null;
  /** 동일 StoreOrderSnapshot.rows 에서 선택된 최신 방 — List[0]과 정합 */
  latestRoomId: string | null;
  latestDomainIdentityKey: string | null;
  hrefToOrderList: string;
}>;

/** Customer surface 기준 리스트 행 — Owner 전용 리스트는 Phase 4 에서 별도 VM */
export type StoreOrderCustomerListViewModel = Readonly<{
  roomId: string;
  chatDomain: typeof STORE_ORDER_DOMAIN;
  domainIdentityKey: string;
  orderId: string;
  storeName: string;
  storeImageUrl: string | null;
  previewText: string;
  unreadCount: number;
  lastMessageAt: string;
  href: string;
  /** status 는 preview 와 분리 */
  statusBadge: string | null;
}>;

export type StoreOrderOwnerListViewModel = Readonly<{
  roomId: string;
  chatDomain: typeof STORE_ORDER_DOMAIN;
  domainIdentityKey: string;
  orderId: string;
  customerName: string;
  customerAvatarUrl: string | null;
  previewText: string;
  unreadCount: number;
  lastMessageAt: string;
  href: string;
  statusBadge: string | null;
}>;

export type StoreOrderCustomerHeaderViewModel = Readonly<{
  kind: "buyer_store";
  storeName: string;
  storeImageUrl: string | null;
  /** Room Identity context — order relation (not peer DM) */
  orderId: string | null;
  orderStatusLabel: string | null;
  forbidsGeneralDirectHeader: true;
  forbidsTradeHeader: true;
}>;

export type StoreOrderOwnerHeaderViewModel = Readonly<{
  kind: "owner_buyer_peer";
  customerName: string;
  customerAvatarUrl: string | null;
  /** Room Identity context — order relation (not peer DM) */
  orderId: string | null;
  orderStatusLabel: string | null;
  forbidsGeneralDirectHeader: true;
  forbidsTradeHeader: true;
  forbidsCustomerStoreHeader: true;
}>;

export const STORE_ORDER_PHASE4_UX_RULES = [
  "home_shows_single_order_hub_not_order_rows",
  "hub_navigates_to_order_only_list",
  "list_one_row_per_order_room",
  "same_store_different_order_separate_rows",
  "customer_row_shows_store_identity",
  "owner_row_shows_customer_identity",
  "forbids_shared_customer_owner_presentation",
  "forbids_trade_header_and_general_direct_header",
  "preview_latest_chat_message_not_order_summary",
  "unread_excluded_from_messenger_nav_badge",
] as const;

/** 기존 UX 경로 유지 — Domain 소유권만 분리 */
export const STORE_ORDER_LIST_HREF = "/community-messenger/delivery-chats" as const;
