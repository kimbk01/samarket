/**
 * store_order Domain — 입력/행 타입 (Phase 4).
 * trade/general 타입 상속 금지. Identity: store_order:{orderId}
 */
import type { DomainListSnapshot } from "@/lib/messenger/contracts/ports";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";

export { STORE_ORDER_DOMAIN };

export type StoreOrderRoomInput = Readonly<{
  roomId: string;
  chatDomain: string | null | undefined;
  domainIdentityKey: string | null | undefined;
  orderId: string | null | undefined;
  storeId: string | null | undefined;
  storeName: string | null | undefined;
  storeImageUrl: string | null | undefined;
  customerUserId: string | null | undefined;
  customerName: string | null | undefined;
  customerAvatarUrl: string | null | undefined;
  /** 최신 주문채팅 메시지 본문 — PreviewPort 입력 전용 원천 */
  latestChatMessageText: string | null | undefined;
  latestChatMessageType?: string | null | undefined;
  latestChatMessageAt: string | null | undefined;
  unreadCount: number | null | undefined;
  orderStatusLabel?: string | null | undefined;
  /** DB `store_orders.fulfillment_type` — delivery vs pickup label wording (SSOT input). */
  fulfillmentType?: string | null | undefined;
  participantUserIds?: ReadonlyArray<string> | null | undefined;
  /** 진단 — Domain 재판정 금지 */
  roomType?: string | null | undefined;
  directKey?: string | null | undefined;
}>;

export type StoreOrderListItem = Readonly<{
  roomId: string;
  chatDomain: typeof STORE_ORDER_DOMAIN;
  domainIdentityKey: string;
  orderId: string;
  storeId: string | null;
  storeName: string;
  storeImageUrl: string | null;
  customerUserId: string | null;
  customerName: string;
  customerAvatarUrl: string | null;
  latestChatMessageText: string;
  latestChatMessageType: string;
  latestChatMessageAt: string;
  unreadCount: number;
  orderStatusLabel: string | null;
  fulfillmentType: string | null;
  generation: string;
}>;

export type StoreOrderDomainState = Readonly<{
  domain: typeof STORE_ORDER_DOMAIN;
  generation: string;
  rows: ReadonlyArray<StoreOrderListItem>;
}>;

export const EMPTY_STORE_ORDER_STATE: StoreOrderDomainState = {
  domain: STORE_ORDER_DOMAIN,
  generation: "0",
  rows: [],
};

export const STORE_ORDER_STORE_NAME_PLACEHOLDER = "매장";
export const STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER = "주문자";

export type StoreOrderListSnapshot = DomainListSnapshot<StoreOrderListItem>;
