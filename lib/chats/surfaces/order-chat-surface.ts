/**
 * 주문 채팅 표면 — 문구·경로만 이 파일에서 관리.
 */

export const ORDER_CHAT_SURFACE = {
  id: "order",
  hubTabLabel: "주문 채팅",
  hubPath: "/orders?tab=chat",
  /** `/orders` 상단 3탭 중 채팅 — 채팅 허브 탭과 문구를 다르게 둘 수 있음 */
  ordersHubTabLabel: "주문채팅",
  listEmptyMessage: "주문 채팅이 없어요.",
  emptyCtaHref: "/orders",
  emptyCtaLabel: "주문 내역으로",
} as const;

export type OrderChatSurface = typeof ORDER_CHAT_SURFACE;
