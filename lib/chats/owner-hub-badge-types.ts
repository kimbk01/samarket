/** 매장 오너 허브 배지 API 응답과 동일한 형태 (하단 「매장」탭·허브 뱃지) */
export type OwnerHubBadgeBreakdown = {
  /** product_chats + chat_rooms 참가자 기준 미읽음 */
  chatUnread: number;
  /** 허브 매장: 접수 대기·환불 요청 */
  orderAttention: number;
  /** 허브 매장: 미답변 문의(open) */
  inquiryAttention: number;
  /** 하단 「매장」탭 숫자 (주문+문의, 딥링크는 API storeDeepLink) */
  storesTabAttention: number;
  /** 매장 탭 탭 시 이동할 경로; 없으면 기본 /stores */
  storeDeepLink: string | null;
  /** chatUnread + orderAttention + inquiryAttention */
  total: number;
};

export const OWNER_HUB_BADGE_EMPTY: OwnerHubBadgeBreakdown = {
  chatUnread: 0,
  orderAttention: 0,
  inquiryAttention: 0,
  storesTabAttention: 0,
  storeDeepLink: null,
  total: 0,
};

export function parseOwnerHubBadgeJson(data: unknown): OwnerHubBadgeBreakdown {
  if (!data || typeof data !== "object" || (data as { ok?: boolean }).ok !== true) {
    return OWNER_HUB_BADGE_EMPTY;
  }
  const d = data as Record<string, unknown>;
  const chatUnread = typeof d.chatUnread === "number" ? d.chatUnread : 0;
  const orderAttention = typeof d.orderAttention === "number" ? d.orderAttention : 0;
  const inquiryAttention = typeof d.inquiryAttention === "number" ? d.inquiryAttention : 0;
  const storesTabAttention = Math.max(0, orderAttention) + Math.max(0, inquiryAttention);
  const storeDeepLink =
    typeof d.storeDeepLink === "string" && d.storeDeepLink.trim() ? d.storeDeepLink.trim() : null;
  const total =
    typeof d.total === "number"
      ? d.total
      : Math.max(0, chatUnread) + Math.max(0, orderAttention) + Math.max(0, inquiryAttention);
  return {
    chatUnread,
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
    a.orderAttention === b.orderAttention &&
    a.inquiryAttention === b.inquiryAttention &&
    a.storesTabAttention === b.storesTabAttention &&
    a.storeDeepLink === b.storeDeepLink &&
    a.total === b.total
  );
}
