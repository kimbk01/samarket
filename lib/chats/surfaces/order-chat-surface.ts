/**
 * 주문 채팅 표면 — 문구·경로만 이 파일에서 관리.
 */

/**
 * 메신저 「배달 채팅」 묶음 → 배달·매장 주문 메신저 방만 모아 보는 서브 라우트.
 *
 * `/my/store-orders` 는 주문(상품·결제) 중심 허브이고, 이 경로는 메신저 안에서
 * 배달 컨텍스트의 1:1·그룹 방만 모아 본다(전용 풀스크린 주문 채팅과는 별개).
 */
export const ORDER_CHAT_MESSENGER_LIST_HREF = "/community-messenger/delivery-chats";

export const ORDER_CHAT_SURFACE = {
  id: "order",
  hubTabLabel: "주문 채팅",
  hubTabLabelKey: "nav_chat_order",
  hubPath: "/my/store-orders",
  /** 메신저 배달 묶음 — 「배달 채팅」 행 진입점 */
  messengerDeliveryListHref: ORDER_CHAT_MESSENGER_LIST_HREF,
  /** `/orders` 허브 상단 탭 라벨(탭 선택 시 실제 이동은 `/my/store-orders`) */
  ordersHubTabLabel: "주문채팅",
  ordersHubTabLabelKey: "nav_chat_order_compact",
  listEmptyMessage: "주문 채팅이 없어요.",
  listEmptyMessageKey: "nav_chat_order_empty",
  emptyCtaHref: "/my/store-orders",
  emptyCtaLabel: "내 배달 주문으로",
  emptyCtaLabelKey: "nav_chat_order_cta",
} as const;

export type OrderChatSurface = typeof ORDER_CHAT_SURFACE;
