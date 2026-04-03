import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";

type SalesPermission = {
  allowed_to_sell?: boolean;
  sales_status?: string | null;
} | null | undefined;

export type OwnerLiteStoreShortcut = { href: string; label: string; badge: number };

export function computeOwnerCanSell(sales: SalesPermission): boolean {
  return !!sales && sales.allowed_to_sell === true && sales.sales_status === "approved";
}

function resolveSafeStoreDeepLink(ownerStoreId: string, href: string | null | undefined): string | null {
  if (!href || !href.startsWith("/")) return null;
  try {
    const url = new URL(href, "https://samarket.local");
    const deepLinkStoreId = url.searchParams.get("storeId")?.trim();
    if (deepLinkStoreId && deepLinkStoreId !== ownerStoreId) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * 하단 OwnerLiteStoreBar 와 동일 우선순위 — 문의 → 신규주문 → 배달채팅 → (판매 가능 시 주문관리) → 매장 설정
 */
export function resolveOwnerLiteStoreShortcuts(
  ownerStore: { id: string; sales_permission?: SalesPermission },
  b: Pick<
    OwnerHubBadgeBreakdown,
    "inquiryAttention" | "orderAttention" | "storeOrderChatUnread" | "storeDeepLink"
  >
): { primary: OwnerLiteStoreShortcut; secondary: OwnerLiteStoreShortcut } {
  const canSell = computeOwnerCanSell(ownerStore.sales_permission);
  const enc = encodeURIComponent(ownerStore.id);
  const profileHref = `/my/business/profile?storeId=${enc}`;
  const basicInfoHref = `/my/business/basic-info?storeId=${enc}`;
  const orderHref = buildStoreOrdersHref({ storeId: ownerStore.id, tab: "new" });
  const inquiryHref = `/my/business/inquiries?storeId=${enc}`;
  const safeStoreDeepLink = resolveSafeStoreDeepLink(ownerStore.id, b.storeDeepLink);

  const primaryHref =
    b.inquiryAttention > 0
      ? safeStoreDeepLink ?? inquiryHref
      : canSell && b.orderAttention > 0
        ? safeStoreDeepLink ?? orderHref
        : b.storeOrderChatUnread > 0
          ? safeStoreDeepLink ?? SAMARKET_ROUTES.orders.storeOrders
          : canSell
            ? safeStoreDeepLink ?? orderHref
            : profileHref;
  const primaryLabel =
    b.inquiryAttention > 0
      ? "문의 확인"
      : canSell && b.orderAttention > 0
        ? "주문 관리"
        : b.storeOrderChatUnread > 0
          ? "배달채팅"
          : canSell
            ? "주문 관리"
            : "매장 설정";
  const primaryBadge =
    b.inquiryAttention > 0
      ? b.inquiryAttention
      : canSell && b.orderAttention > 0
        ? b.orderAttention
        : b.storeOrderChatUnread > 0
          ? b.storeOrderChatUnread
          : canSell
            ? b.orderAttention
            : 0;

  const secondaryHref =
    b.inquiryAttention > 0 ? (canSell ? orderHref : basicInfoHref) : canSell ? inquiryHref : basicInfoHref;
  const secondaryLabel =
    b.inquiryAttention > 0 ? (canSell ? "주문 관리" : "기본 정보") : canSell ? "받은 문의" : "기본 정보";
  const secondaryBadge =
    b.inquiryAttention > 0 ? (canSell ? b.orderAttention : 0) : canSell ? b.inquiryAttention : 0;

  return {
    primary: { href: primaryHref, label: primaryLabel, badge: primaryBadge },
    secondary: { href: secondaryHref, label: secondaryLabel, badge: secondaryBadge },
  };
}
