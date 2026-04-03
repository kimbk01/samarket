/** 매장 오너 허브 배지 API 응답과 동일한 형태 (하단 「매장」탭·허브 뱃지) */
export type OwnerHubBadgeBreakdown = {
  /** 하단 「채팅」탭 — `/chats` 거래 목록과 동일 범위(item_trade + 레거시 product_chats) */
  chatUnread: number;
  /** 하단 「커뮤니티」탭 — 커뮤니티·일반 DM 등(非 거래 item_trade) 참가자 미읽음 */
  philifeChatUnread: number;
  /** 거래 + 커뮤니티 채팅 미읽음 합 */
  socialChatUnread: number;
  /** 하단 「매장」탭에 더해질 매장 주문 채팅 미읽음 */
  storeOrderChatUnread: number;
  /** 허브 매장: 접수 대기·환불 요청 */
  orderAttention: number;
  /** 허브 매장: 미답변 문의(open) */
  inquiryAttention: number;
  /** 하단 「매장」탭 숫자 (주문+문의+매장 주문 채팅, 딥링크는 API storeDeepLink) */
  storesTabAttention: number;
  /** 매장 탭 탭 시 이동할 경로; 없으면 기본 /stores */
  storeDeepLink: string | null;
  /** socialChatUnread + storesTabAttention */
  total: number;
};

export const OWNER_HUB_BADGE_EMPTY: OwnerHubBadgeBreakdown = {
  chatUnread: 0,
  philifeChatUnread: 0,
  socialChatUnread: 0,
  storeOrderChatUnread: 0,
  orderAttention: 0,
  inquiryAttention: 0,
  storesTabAttention: 0,
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
  const socialChatUnread =
    typeof d.socialChatUnread === "number"
      ? d.socialChatUnread
      : philifeChatUnread > 0 || typeof d.philifeChatUnread === "number"
        ? chatUnread + philifeChatUnread
        : chatUnread;
  const storeOrderChatUnread =
    typeof d.storeOrderChatUnread === "number" ? d.storeOrderChatUnread : 0;
  const orderAttention = typeof d.orderAttention === "number" ? d.orderAttention : 0;
  const inquiryAttention = typeof d.inquiryAttention === "number" ? d.inquiryAttention : 0;
  const storesTabAttention =
    typeof d.storesTabAttention === "number"
      ? d.storesTabAttention
      : Math.max(0, orderAttention) + Math.max(0, inquiryAttention) + Math.max(0, storeOrderChatUnread);
  const storeDeepLink = parseInternalAppHref(d.storeDeepLink);
  const total =
    typeof d.total === "number"
      ? d.total
      : Math.max(0, socialChatUnread) + Math.max(0, storesTabAttention);
  return {
    chatUnread,
    philifeChatUnread,
    socialChatUnread,
    storeOrderChatUnread,
    orderAttention,
    inquiryAttention,
    storesTabAttention,
    storeDeepLink,
    total,
  };
}

export function sameOwnerHubBadge(a: OwnerHubBadgeBreakdown, b: OwnerHubBadgeBreakdown): boolean {
  return (
    a.chatUnread === b.chatUnread &&
    a.philifeChatUnread === b.philifeChatUnread &&
    a.socialChatUnread === b.socialChatUnread &&
    a.storeOrderChatUnread === b.storeOrderChatUnread &&
    a.orderAttention === b.orderAttention &&
    a.inquiryAttention === b.inquiryAttention &&
    a.storesTabAttention === b.storesTabAttention &&
    a.storeDeepLink === b.storeDeepLink &&
    a.total === b.total
  );
}
