import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { encodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import {
  MESSENGER_ROOM_RETURN_QUERY_KEY,
  sanitizeMessengerRoomReturnHref,
} from "@/lib/community-messenger/messenger-entry-origin";

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

/** 주문 관리(결제·상태·리뷰) — 주문 채팅방 리스트와 분리 */
export const ORDER_MANAGEMENT_HUB_PATH = "/mypage/store-orders";

export const ORDER_CHAT_SURFACE = {
  id: "order",
  hubTabLabel: "주문 채팅",
  hubTabLabelKey: "nav_chat_order",
  /** 주문 채팅방 리스트 SSOT */
  hubPath: ORDER_CHAT_MESSENGER_LIST_HREF,
  /** 주문 관리(목록·상세) — `hubPath` 와 혼용 금지 */
  orderManagementHubPath: ORDER_MANAGEMENT_HUB_PATH,
  /** 메신저 배달 묶음 — 「배달 채팅」 행 진입점 */
  messengerDeliveryListHref: ORDER_CHAT_MESSENGER_LIST_HREF,
  /** 레거시 `/orders` 허브 탭 — 주문 채팅방 리스트로 연결 */
  ordersHubTabLabel: "주문 채팅",
  ordersHubTabLabelKey: "nav_chat_order_compact",
  listEmptyMessage: "주문 채팅이 없어요.",
  listEmptyMessageKey: "nav_chat_order_empty",
  emptyCtaHref: ORDER_MANAGEMENT_HUB_PATH,
  emptyCtaLabel: "내 배달 주문으로",
  emptyCtaLabelKey: "nav_chat_order_cta",
} as const;

export type OrderChatSurface = typeof ORDER_CHAT_SURFACE;

/** 배달·매장 주문 채팅방 — 메신저 앱 라우트 (`/community-messenger/rooms/[roomId]`). */
export function buildStoreOrderMessengerRoomHref(
  roomId: string,
  options?: {
    contextMeta?: CommunityMessengerRoomContextMetaV1 | null;
    entryOrigin?: "delivery" | null;
    /** 진입 직전 화면 — 방 뒤로가기·스와이프 복귀용 (`cm_return`) */
    returnHref?: string | null;
  }
): string {
  const id = roomId.trim();
  if (!id) return ORDER_CHAT_MESSENGER_LIST_HREF;
  const u = new URL(`/community-messenger/rooms/${encodeURIComponent(id)}`, "https://samarket.local");
  u.searchParams.set("from", options?.entryOrigin ?? "delivery");
  u.searchParams.set("cm_list", "delivery");
  const ret = sanitizeMessengerRoomReturnHref(options?.returnHref);
  if (ret) u.searchParams.set(MESSENGER_ROOM_RETURN_QUERY_KEY, ret);
  const meta = options?.contextMeta;
  if (meta?.kind === "delivery") {
    u.searchParams.set("cm_ctx", encodeCommunityMessengerRoomCmCtx(meta));
  }
  return `${u.pathname}${u.search}`;
}

export function orderMessengerRoomHref(roomId: string): string {
  return buildStoreOrderMessengerRoomHref(roomId);
}

/** 메신저 방 id 가 없을 때 — canonical owner ensure route (`/stores/owner/order-chat/:id`) */
export function storeOrderChatEnsureRedirectHref(orderId: string): string {
  const id = orderId.trim();
  if (!id) return ORDER_CHAT_MESSENGER_LIST_HREF;
  return `/stores/owner/order-chat/${encodeURIComponent(id)}`;
}
