/**
 * 주문 채팅 표면 — 문구·경로만 이 파일에서 관리.
 */

export const ORDER_CHAT_SURFACE = {
  id: "order",
  hubTabLabel: "주문 채팅",
  hubPath: "/my/store-orders",
  /** `/orders` 허브 상단 탭 라벨(탭 선택 시 실제 이동은 `/my/store-orders`) */
  ordersHubTabLabel: "주문채팅",
  listEmptyMessage: "주문 채팅이 없어요.",
  emptyCtaHref: "/my/store-orders",
  emptyCtaLabel: "내 배달 주문으로",
} as const;

export type OrderChatSurface = typeof ORDER_CHAT_SURFACE;
