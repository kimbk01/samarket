import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";

export type InboxHrefRow = {
  notification_type: string;
  link_url: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * 구매자 매장 주문 알림: 링크가 상세/채팅이어도 목록으로 통일 (`MyNotificationsView` 와 동일)
 */
export function resolveNotificationInboxHref(r: InboxHrefRow): string | null {
  const u = r.link_url?.trim();
  if (!u) return null;
  if (r.notification_type !== "commerce") return u;
  if (isOwnerStoreCommerceNotificationRow(r)) return u;
  let path = u;
  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      path = new URL(u).pathname;
    } catch {
      return u;
    }
  }
  if (path === "/my/store-orders" || path.startsWith("/my/store-orders/")) {
    return "/my/store-orders";
  }
  return u;
}

export function defaultInboxFallbackHref(): string {
  return "/mypage/notifications#notification-inbox";
}
