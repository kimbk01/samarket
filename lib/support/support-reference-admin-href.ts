/**
 * CUT D — Admin Support context → canonical domain screens.
 * Read-only deep-links. Support never mutates Ads / Finance / Partner.
 */

import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { MessageKey } from "@/lib/i18n/messages";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { adsBoostOrderDeepLinkHref } from "@/lib/admin/ads-exposure/boost-order-deep-link";
import type { SupportReferenceType } from "@/lib/support/support-reference-authority";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";

export type SupportAdminContextLink = {
  href: string;
  /** 링크 이름 — 화면은 `t(labelKey)` (최종 감사 2026-11-28 U-9: 코드 안 문구·개발 용어 금지) */
  labelKey: MessageKey;
  /** Domain mutation lives elsewhere — Support is navigation only. */
  mutationOwner:
    | "ADS"
    | "FINANCE"
    | "STORE"
    | "MEMBER"
    | "CHAT"
    | "PARTNER"
    | "COMMUNITY"
    | "SUPPORT_ARCHIVE"
    | "NONE";
  /**
   * 열 수 있는 권한 (하나라도) — 없으면 상담 화면은 링크 대신 「권한 필요」만 표시한다.
   * 지원 담당에게 채팅 열람권을 새로 주지 않는다 (설계 §2-3).
   */
  requiredPermissions?: readonly AdminPermissionKey[];
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
        labelKey: "admin_support_link_ad_detail",
        mutationOwner: "ADS",
      };
    case "FEED_AD_REQUEST":
      return {
        href: `/admin/feed-ad-requests/${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_feed_ad_request",
        mutationOwner: "ADS",
      };
    case "POINT_PROMOTION_ORDER":
      return {
        href: adsBoostOrderDeepLinkHref(id),
        labelKey: "admin_support_link_boost_order",
        mutationOwner: "ADS",
      };
    case "PLATFORM_POPUP_OWNER_REQUEST":
      return {
        href: `/admin/platform-popup/requests/${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_popup_request",
        mutationOwner: "ADS",
      };
    // 광고 원장 §2 (2026-11-07): 운영자 팝업 · PTR · 피드 운영자 캠페인 · 이벤트 배너 참조
    case "PLATFORM_POPUP_CAMPAIGN":
      return {
        href: `/admin/platform-popup/${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_operator_popup",
        mutationOwner: "ADS",
      };
    case "PTR_REVEAL_CAMPAIGN":
      return {
        href: `/admin/ptr-reveal-ads/${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_ptr_band_ad",
        mutationOwner: "ADS",
      };
    case "FEED_AD_CAMPAIGN":
      return {
        href: `/admin/feed-ads/${encodeURIComponent(id)}/edit`,
        labelKey: "admin_support_link_operator_feed_banner",
        mutationOwner: "ADS",
      };
    case "EVENT_BANNER":
      // 이벤트 배너 = 이벤트 배포 행 id — 원장에서 그 광고 행을 연다
      return {
        href: `/admin/advertising?kind=event_hero`,
        labelKey: "admin_support_link_event_banner",
        mutationOwner: "ADS",
      };
    case "STORE_ORDER":
      return {
        href: `/admin/stores/orders/${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_order",
        mutationOwner: "STORE",
      };
    case "STORE_PRODUCT":
      return {
        href: `/admin/store-products?productId=${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_product",
        mutationOwner: "STORE",
      };
    case "STORE_SETTLEMENT":
      return {
        href: `/admin/store-settlements?id=${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_settlement",
        mutationOwner: "FINANCE",
      };
    case "GIFT_INSTANCE":
      return {
        href: `/admin/gift-certificates?instanceId=${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_gift_certificate",
        mutationOwner: "FINANCE",
      };
    case "POINT_CHARGE_REQUEST":
      return {
        href: `/admin/point-charges/${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_point_charge",
        mutationOwner: "FINANCE",
      };
    case "BUSINESS_CASH_CHARGE_REQUEST":
      return {
        href: `/admin/delivery-ads/cash-charges?requestId=${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_cash_charge_queue",
        mutationOwner: "FINANCE",
      };
    case "COIN_WITHDRAWAL_REQUEST":
      return {
        href: `/admin/finance?coinWithdrawalRequestId=${encodeURIComponent(id)}#coin-withdrawals`,
        labelKey: "admin_support_link_coin_withdrawal",
        mutationOwner: "FINANCE",
      };
    case "PARTNER_MEMBERSHIP":
      return {
        href: `${DELIVERY_AD_ADMIN_ROUTES.partnerMemberships}?membershipId=${encodeURIComponent(id)}&status=PENDING_REVIEW`,
        labelKey: "admin_support_link_partner_membership",
        mutationOwner: "PARTNER",
      };
    case "COMMUNITY_POST":
      return {
        href: `/admin/community/posts/${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_community_post",
        mutationOwner: "COMMUNITY",
        requiredPermissions: ["boards", "reports"],
      };
    case "COMMUNITY_COMMENT":
      return {
        href: `/admin/community/comments?commentId=${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_community_comment",
        mutationOwner: "COMMUNITY",
        requiredPermissions: ["boards", "reports"],
      };
    case "COMMUNITY_REPORT":
      return {
        href: `/admin/community/reports?reportId=${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_community_report",
        mutationOwner: "COMMUNITY",
        requiredPermissions: ["reports"],
      };
    case "COMMUNITY_SANCTION":
      return {
        href: `/admin/community/restrictions?sanctionId=${encodeURIComponent(id)}`,
        labelKey: "admin_support_link_community_restriction",
        mutationOwner: "COMMUNITY",
        requiredPermissions: ["reports"],
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
      labelKey: "admin_support_link_store",
      mutationOwner: "STORE",
    });
    links.push({
      href: businessCcFinancialStatementHref(storeId),
      labelKey: "admin_support_link_store_statement",
      mutationOwner: "FINANCE",
    });
    links.push({
      href: `/admin/finance?storeId=${encodeURIComponent(storeId)}#action-required`,
      labelKey: "admin_support_link_finance_overview",
      mutationOwner: "FINANCE",
    });
    // 광고 원장 §2 반대 방향 (2026-11-07): 문의 상세 → 「이 광고주의 광고」 = 같은 원장 + 광고주 거름
    links.push({
      href: `/admin/advertising?advertiser=${encodeURIComponent(storeId)}`,
      labelKey: "admin_support_link_advertiser_ads",
      mutationOwner: "ADS",
    });
  }
  const userId = (input.requesterUserId ?? "").trim();
  if (userId) {
    links.push({
      href: `/admin/users?userId=${encodeURIComponent(userId)}`,
      labelKey: "admin_support_link_member",
      mutationOwner: "MEMBER",
    });
    links.push({
      href: `/admin/advertising?advertiser=${encodeURIComponent(userId)}`,
      labelKey: "admin_support_link_advertiser_ads",
      mutationOwner: "ADS",
    });
    // 채팅 Admin 설계 §2-3: 요청자의 거래·주문 채팅방 (본문 열람은 방 권한 규칙 그대로).
    links.push({
      href: `/admin/chats?user_id=${encodeURIComponent(userId)}`,
      labelKey: "admin_support_link_requester_chats",
      mutationOwner: "CHAT",
      // 전체 채팅방 목록 API(`/api/admin/community-messenger/rooms?type=all`)와 같은 권한.
      requiredPermissions: ["chats"],
    });
  }
  const ref = resolveSupportReferenceAdminHref(input.referenceType, input.referenceId);
  if (ref) links.push(ref);

  links.push({
    href: "/admin/support/archive",
    labelKey: "admin_support_link_past_inquiries",
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
