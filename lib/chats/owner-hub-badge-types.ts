/** 매장 오너 허브 배지 API 응답과 동일한 형태 (하단 「매장」탭·허브 뱃지) */
export type OwnerHubBadgeBreakdown = {
  /** 하단 「채팅」탭 — `/chats` 거래 목록과 동일 범위(item_trade + 레거시 product_chats) */
  chatUnread: number;
  /** 하단 「메신저」탭(`/community-messenger`) — 친구·그룹·거래·배달 메신저 참가자 미읽음 */
  communityMessengerUnread: number;
  /** 하단 「커뮤니티」탭 — 커뮤니티·일반 DM 등(非 거래 item_trade) 참가자 미읽음 */
  philifeChatUnread: number;
  /** 거래 + 커뮤니티 채팅 미읽음 합 */
  socialChatUnread: number;
  /**
   * Owner 주문채팅 unread **방** 수 — **현재 hub storeId 스코프** (`fab_owner_order_chat`).
   * Store FAB 전용. Domain badge-count apply 가 이 필드를 전역 owner 합으로 덮어쓰지 않음.
   */
  storeOrderChatUnread: number;
  /**
   * Owner 주문채팅 unread **방** 수 — **전체 매장 합계** (Domain Authority).
   * App Icon / 전체 오너 허브. 특정 매장 FAB 는 `storeOrderChatUnread` 사용.
   */
  storeOrderOwnerUnreadRooms: number;
  /** 허브 매장: 접수 대기·환불 요청 */
  orderAttention: number;
  /** 허브 매장: 미답변 문의(open) */
  inquiryAttention: number;
  /** 매장 FAB 스토어 — 신규 리뷰 (owner_store scope target) */
  ownerReviewAttention: number;
  /** 하단 「매장」탭 숫자 (주문+문의+매장 주문 채팅, 딥링크는 API storeDeepLink) */
  storesTabAttention: number;
  /**
   * Customer 주문채팅 unread **방** 수 (`buyer_order` / bottom_nav_delivery).
   * 메신저 「주문 채팅」 묶음 행 + `/delivery-chats` list 와 동일 축.
   */
  buyerOrderAttention: number;
  /** 매장 탭 탭 시 이동할 경로; 없으면 기본 /stores */
  storeDeepLink: string | null;
  /** socialChatUnread + storesTabAttention */
  total: number;
};

export const OWNER_HUB_BADGE_EMPTY: OwnerHubBadgeBreakdown = {
  chatUnread: 0,
  communityMessengerUnread: 0,
  philifeChatUnread: 0,
  socialChatUnread: 0,
  storeOrderChatUnread: 0,
  storeOrderOwnerUnreadRooms: 0,
  orderAttention: 0,
  inquiryAttention: 0,
  ownerReviewAttention: 0,
  storesTabAttention: 0,
  buyerOrderAttention: 0,
  storeDeepLink: null,
  total: 0,
};

function parseInternalAppHref(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  try {
    const url = new URL(trimmed, "https://samarket.local");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function parseOwnerHubBadgeJson(data: unknown): OwnerHubBadgeBreakdown {
  if (!data || typeof data !== "object" || (data as { ok?: boolean }).ok !== true) {
    return OWNER_HUB_BADGE_EMPTY;
  }
  const d = data as Record<string, unknown>;
  const philifeChatUnread = typeof d.philifeChatUnread === "number" ? d.philifeChatUnread : 0;
  const chatUnread = typeof d.chatUnread === "number" ? d.chatUnread : 0;
  const communityMessengerUnread =
    typeof d.communityMessengerUnread === "number" ? d.communityMessengerUnread : 0;
  const socialChatUnread =
    typeof d.socialChatUnread === "number"
      ? d.socialChatUnread
      : philifeChatUnread > 0 || typeof d.philifeChatUnread === "number"
        ? chatUnread + philifeChatUnread
        : chatUnread;
  const storeOrderChatUnread =
    typeof d.storeOrderChatUnread === "number" ? d.storeOrderChatUnread : 0;
  /** Missing → 0 (do not alias store-scoped FAB into global owner aggregate). */
  const storeOrderOwnerUnreadRooms =
    typeof d.storeOrderOwnerUnreadRooms === "number" ? d.storeOrderOwnerUnreadRooms : 0;
  const orderAttention = typeof d.orderAttention === "number" ? d.orderAttention : 0;
  const inquiryAttention = typeof d.inquiryAttention === "number" ? d.inquiryAttention : 0;
  const ownerReviewAttention =
    typeof d.ownerReviewAttention === "number" ? d.ownerReviewAttention : 0;
  const buyerOrderAttention =
    typeof d.buyerOrderAttention === "number" ? d.buyerOrderAttention : 0;
  const storesTabAttention =
    typeof d.storesTabAttention === "number"
      ? d.storesTabAttention
      : Math.max(0, buyerOrderAttention) ||
        Math.max(0, orderAttention) + Math.max(0, inquiryAttention);
  const storeDeepLink = parseInternalAppHref(d.storeDeepLink);
  const total =
    typeof d.total === "number"
      ? d.total
      : Math.max(0, socialChatUnread) + Math.max(0, storesTabAttention) + Math.max(0, communityMessengerUnread);
  return {
    chatUnread,
    communityMessengerUnread,
    philifeChatUnread,
    socialChatUnread,
    storeOrderChatUnread,
    storeOrderOwnerUnreadRooms,
    orderAttention,
    inquiryAttention,
    ownerReviewAttention,
    storesTabAttention,
    buyerOrderAttention,
    storeDeepLink,
    total,
  };
}

export function sameOwnerHubBadge(a: OwnerHubBadgeBreakdown, b: OwnerHubBadgeBreakdown): boolean {
  return (
    a.chatUnread === b.chatUnread &&
    a.communityMessengerUnread === b.communityMessengerUnread &&
    a.philifeChatUnread === b.philifeChatUnread &&
    a.socialChatUnread === b.socialChatUnread &&
    a.storeOrderChatUnread === b.storeOrderChatUnread &&
    a.storeOrderOwnerUnreadRooms === b.storeOrderOwnerUnreadRooms &&
    a.orderAttention === b.orderAttention &&
    a.inquiryAttention === b.inquiryAttention &&
    a.ownerReviewAttention === b.ownerReviewAttention &&
    a.storesTabAttention === b.storesTabAttention &&
    a.buyerOrderAttention === b.buyerOrderAttention &&
    a.storeDeepLink === b.storeDeepLink &&
    a.total === b.total
  );
}
