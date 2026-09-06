/**
 * CUT D — Admin Support context → canonical domain screens.
 * Read-only deep-links. Support never mutates Ads / Finance / Partner.
 */

import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import type { SupportReferenceType } from "@/lib/support/support-reference-authority";

export type SupportAdminContextLink = {
  href: string;
  labelKo: string;
  labelEn: string;
  /** Domain mutation lives elsewhere — Support is navigation only. */
  mutationOwner: "ADS" | "FINANCE" | "STORE" | "MEMBER" | "PARTNER" | "SUPPORT_ARCHIVE" | "NONE";
};

/** Resolve primary Admin href for a Support reference (fail-soft → null). */
export function resolveSupportReferenceAdminHref(
  referenceType: string | null | undefined,
  referenceId: string | null | undefined
): SupportAdminContextLink | null {
  const type = (referenceType ?? "").trim();
  const id = (referenceId ?? "").trim();
  if (!type || !id) return null;

  switch (type as SupportReferenceType | string) {
    case "AD_CAMPAIGN":
    case "DELIVERY_AD_CAMPAIGN":
      return {
        href: DELIVERY_AD_ADMIN_ROUTES.detail(id),
        labelKo: "광고 상세 보기",
        labelEn: "Open ad detail",
        mutationOwner: "ADS",
      };
    case "FEED_AD_REQUEST":
      return {
        href: `/admin/feed-ad-requests/${encodeURIComponent(id)}`,
        labelKo: "피드 광고 신청 보기",
        labelEn: "Open feed ad request",
        mutationOwner: "ADS",
      };
    case "PLATFORM_POPUP_OWNER_REQUEST":
      return {
        href: `/admin/platform-popup/requests/${encodeURIComponent(id)}`,
        labelKo: "팝업 신청 보기",
        labelEn: "Open popup request",
        mutationOwner: "ADS",
      };
    case "STORE_ORDER":
      return {
        href: `/admin/stores/orders/${encodeURIComponent(id)}`,
        labelKo: "주문 상세 보기",
        labelEn: "Open order",
        mutationOwner: "STORE",
      };
    case "STORE_PRODUCT":
      return {
        href: `/admin/store-products?productId=${encodeURIComponent(id)}`,
        labelKo: "상품 보기",
        labelEn: "Open product",
        mutationOwner: "STORE",
      };
    case "STORE_SETTLEMENT":
      return {
        href: `/admin/store-settlements?id=${encodeURIComponent(id)}`,
        labelKo: "정산 보기",
        labelEn: "Open settlement",
        mutationOwner: "FINANCE",
      };
    case "GIFT_INSTANCE":
      return {
        href: `/admin/gift-certificates?instanceId=${encodeURIComponent(id)}`,
        labelKo: "상품권 보기",
        labelEn: "Open gift certificate",
        mutationOwner: "FINANCE",
      };
    case "POINT_CHARGE_REQUEST":
      return {
        href: `/admin/point-charges/${encodeURIComponent(id)}`,
        labelKo: "Point 충전 요청 보기",
        labelEn: "Open Point charge request",
        mutationOwner: "FINANCE",
      };
    case "BUSINESS_CASH_CHARGE_REQUEST":
      return {
        href: `/admin/delivery-ads/cash-charges?requestId=${encodeURIComponent(id)}`,
        labelKo: "Cash 충전 대기열",
        labelEn: "Open Cash charge queue",
        mutationOwner: "FINANCE",
      };
    case "PARTNER_MEMBERSHIP":
      return {
        href: `${DELIVERY_AD_ADMIN_ROUTES.partnerMemberships}?membershipId=${encodeURIComponent(id)}&status=PENDING_REVIEW`,
        labelKo: "Partner 멤버십 검토",
        labelEn: "Open Partner membership",
        mutationOwner: "PARTNER",
      };
    default:
      return null;
  }
}

/** Extra context links from case fields (no duplicated domain snapshots). */
export function resolveSupportCaseContextLinks(input: {
  ownerStoreId?: string | null;
  requesterUserId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}): SupportAdminContextLink[] {
  const links: SupportAdminContextLink[] = [];
  const storeId = (input.ownerStoreId ?? "").trim();
  if (storeId) {
    links.push({
      href: `/admin/business/${encodeURIComponent(storeId)}`,
      labelKo: "매장 보기",
      labelEn: "Open store",
      mutationOwner: "STORE",
    });
    links.push({
      href: `/admin/finance?storeId=${encodeURIComponent(storeId)}&view=statement`,
      labelKo: "매장 재무 명세서 (B3)",
      labelEn: "Store financial statement (B3)",
      mutationOwner: "FINANCE",
    });
    links.push({
      href: `/admin/finance?storeId=${encodeURIComponent(storeId)}#action-required`,
      labelKo: "재무 관제 (B4)",
      labelEn: "Finance control plane (B4)",
      mutationOwner: "FINANCE",
    });
  }
  const userId = (input.requesterUserId ?? "").trim();
  if (userId) {
    links.push({
      href: `/admin/users?userId=${encodeURIComponent(userId)}`,
      labelKo: "회원 보기",
      labelEn: "Open member",
      mutationOwner: "MEMBER",
    });
  }
  const ref = resolveSupportReferenceAdminHref(input.referenceType, input.referenceId);
  if (ref) links.push(ref);

  links.push({
    href: "/admin/support/archive",
    labelKo: "이전 문의 기록",
    labelEn: "Legacy inquiry archive",
    mutationOwner: "SUPPORT_ARCHIVE",
  });

  return links;
}

/** Ads detail → Support inbox filtered by execution/reference id. */
export function supportInboxHrefForReference(referenceId: string): string {
  const id = referenceId.trim();
  if (!id) return "/admin/support";
  return `/admin/support?search=${encodeURIComponent(id)}`;
}

/** Partner / store → Support inbox filtered by store id (owner_store_id search). */
export function supportInboxHrefForStore(storeId: string): string {
  const id = storeId.trim();
  if (!id) return "/admin/support?filter=OWNER";
  return `/admin/support?filter=OWNER&search=${encodeURIComponent(id)}`;
}
