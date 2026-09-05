/**
 * ARO-AC-001 — Dashboard / Action Center source matrix (read-only).
 * No new SSOT tables. Counts come from loadAdminActionQueueCounts (+ documented tables).
 */

export type AroAc001SourceRow = {
  item: string;
  canonicalSource: string;
  countQuery: string;
  deeplink: string;
  actionable: boolean;
  errorSemantics: "unavailable_not_zero" | "schema_missing_as_zero";
};

export const ARO_AC_001_SOURCE_MATRIX: readonly AroAc001SourceRow[] = [
  {
    item: "MEMBERS",
    canonicalSource: "profiles (via store applications / reports context)",
    countQuery: "stores.approval_status pending|under_review (store_applications); no fake DAU",
    deeplink: "/admin/stores",
    actionable: true,
    errorSemantics: "schema_missing_as_zero",
  },
  {
    item: "STORES",
    canonicalSource: "stores",
    countQuery: "approval_status in pending|under_review",
    deeplink: "/admin/stores",
    actionable: true,
    errorSemantics: "schema_missing_as_zero",
  },
  {
    item: "ORDERS",
    canonicalSource: "store_orders",
    countQuery: "needs_admin_attention=true OR order_status=refund_requested",
    deeplink: "/admin/store-orders?order_status=refund_requested",
    actionable: true,
    errorSemantics: "unavailable_not_zero",
  },
  {
    item: "TRADE",
    canonicalSource: "reports + point_promotion_orders(domain=trade)",
    countQuery: "reports status pending|reviewing; promo pending_review",
    deeplink: "/admin/reports?domain=trade",
    actionable: true,
    errorSemantics: "schema_missing_as_zero",
  },
  {
    item: "COMMUNITY REPORTS",
    canonicalSource: "community_reports",
    countQuery: "status open|reviewing",
    deeplink: "/admin/community/reports",
    actionable: true,
    errorSemantics: "unavailable_not_zero",
  },
  {
    item: "MEETING REPORTS",
    canonicalSource: "meeting_reports",
    countQuery: "status pending|reviewing",
    deeplink: "/admin/philife/meeting-reports",
    actionable: true,
    errorSemantics: "unavailable_not_zero",
  },
  {
    item: "POINT",
    canonicalSource: "point_charge_requests",
    countQuery: "request_status pending|waiting_confirm|on_hold",
    deeplink: "/admin/point-charges",
    actionable: true,
    errorSemantics: "schema_missing_as_zero",
  },
  {
    item: "COIN",
    canonicalSource: "coin_withdrawal_requests",
    countQuery: "status=REQUESTED",
    deeplink: "/admin/finance#coin-withdrawals",
    actionable: true,
    errorSemantics: "unavailable_not_zero",
  },
  {
    item: "CASH",
    canonicalSource: "business_cash_charge_requests",
    countQuery: "status=PENDING",
    deeplink: "/admin/delivery-ads/cash-charges",
    actionable: true,
    errorSemantics: "schema_missing_as_zero",
  },
  {
    item: "SETTLEMENT",
    canonicalSource: "store_settlements",
    countQuery: "settlement_status in scheduled|held",
    deeplink: "/admin/store-settlements?settlement_status=scheduled",
    actionable: true,
    errorSemantics: "unavailable_not_zero",
  },
  {
    item: "DELIVERY ADS",
    canonicalSource: "delivery_ad_operations_cases",
    countQuery: "status=WAITING_ADMIN",
    deeplink: "/admin/delivery-ads?view=actionable",
    actionable: true,
    errorSemantics: "schema_missing_as_zero",
  },
  {
    item: "FEED ADS",
    canonicalSource: "feed_ad_requests",
    countQuery: "pending_review (ops projection)",
    deeplink: "/admin/feed-ad-requests",
    actionable: true,
    errorSemantics: "schema_missing_as_zero",
  },
  {
    item: "POPUP",
    canonicalSource: "platform_popup_owner_requests",
    countQuery: "request_status in submitted|under_review",
    deeplink: "/admin/platform-popup",
    actionable: true,
    errorSemantics: "unavailable_not_zero",
  },
  {
    item: "PARTNER",
    canonicalSource: "delivery_ad_partner_memberships",
    countQuery: "status=PENDING_REVIEW",
    deeplink: "/admin/delivery-ads/partner",
    actionable: true,
    errorSemantics: "unavailable_not_zero",
  },
  {
    item: "SUPPORT",
    canonicalSource: "support_cases",
    countQuery: "status OPEN|WAITING_ADMIN",
    deeplink: "/admin/support?filter=ACTIONABLE#action-required",
    actionable: true,
    errorSemantics: "schema_missing_as_zero",
  },
] as const;
