/**
 * CUT R7 — Event authority matrix (read documentation for tests/report).
 * Does not invent storage. STATE_ONLY / GAP are explicit.
 */

export type AdsHistoryAuthorityCell = {
  table: string;
  fields: string;
  verdict: "PROVEN" | "STATE_ONLY" | "N_A" | "GAP" | "PARTIAL" | "LEGACY";
  note: string;
};

export type AdsHistoryProductAuthority = {
  productKey: string;
  application: AdsHistoryAuthorityCell;
  payment: AdsHistoryAuthorityCell;
  approval: AdsHistoryAuthorityCell;
  operations: AdsHistoryAuthorityCell;
  runtime: AdsHistoryAuthorityCell;
  refund: AdsHistoryAuthorityCell;
  end: AdsHistoryAuthorityCell;
};

export const ADS_HISTORY_EVENT_AUTHORITY_MATRIX: AdsHistoryProductAuthority[] = [
  {
    productKey: "community_boost",
    application: {
      table: "point_promotion_orders",
      fields: "user_id, created_at, domain=community, target_*",
      verdict: "PROVEN",
      note: "Member apply only",
    },
    payment: {
      table: "point_promotion_orders + point_ledger/holds",
      fields: "point_cost (historical snapshot)",
      verdict: "PROVEN",
      note: "Never promotion-products catalog current price",
    },
    approval: {
      table: "—",
      fields: "requiresAdminApproval=false",
      verdict: "N_A",
      note: "No human approval on live path",
    },
    operations: {
      table: "point_promotion_orders",
      fields: "order_status pause/active/ended",
      verdict: "STATE_ONLY",
      note: "adminUserId void — actor NOT_PROVEN",
    },
    runtime: {
      table: "feed promotion projection",
      fields: "schedule + status",
      verdict: "GAP",
      note: "No impression event table",
    },
    refund: {
      table: "—",
      fields: "end path no auto-refund",
      verdict: "GAP",
      note: "Do not invent end refund",
    },
    end: {
      table: "point_promotion_orders",
      fields: "order_status=ended, end_at",
      verdict: "PROVEN",
      note: "State + end_at",
    },
  },
  {
    productKey: "trade_boost",
    application: {
      table: "point_promotion_orders",
      fields: "user_id, created_at, domain=trade",
      verdict: "PROVEN",
      note: "Same as community boost",
    },
    payment: {
      table: "point_promotion_orders",
      fields: "point_cost",
      verdict: "PROVEN",
      note: "Historical order amount",
    },
    approval: {
      table: "—",
      fields: "—",
      verdict: "N_A",
      note: "No approval",
    },
    operations: {
      table: "point_promotion_orders",
      fields: "order_status",
      verdict: "STATE_ONLY",
      note: "Actor not stored",
    },
    runtime: {
      table: "trade feed projection",
      fields: "schedule",
      verdict: "GAP",
      note: "Impression GAP",
    },
    refund: {
      table: "—",
      fields: "—",
      verdict: "GAP",
      note: "No end auto-refund",
    },
    end: {
      table: "point_promotion_orders",
      fields: "ended, end_at",
      verdict: "PROVEN",
      note: "",
    },
  },
  {
    productKey: "delivery_store_sponsored",
    application: {
      table: "store_paid_ad_campaigns",
      fields: "owner_user_id, campaign_source, created_at",
      verdict: "PROVEN",
      note: "OWNER_PAID | DIBAY_FIRST_PARTY",
    },
    payment: {
      table: "delivery_ad_campaign_commercial_snapshots + BC funding",
      fields: "final_payable_minor",
      verdict: "PROVEN",
      note: "Never delivery_ad_packages current price",
    },
    approval: {
      table: "delivery_ad_audit_logs + lifecycle/review",
      fields: "actor_*, action, created_at",
      verdict: "PROVEN",
      note: "Audit events when present",
    },
    operations: {
      table: "delivery_ad_audit_logs",
      fields: "pause/resume/end actions",
      verdict: "PROVEN",
      note: "",
    },
    runtime: {
      table: "delivery_ad_impression_events",
      fields: "created_at",
      verdict: "PARTIAL",
      note: "Events exist; list may omit aggregates until detail load",
    },
    refund: {
      table: "business_cash_ledger via reject refund RPC",
      fields: "refund_ledger_id",
      verdict: "PARTIAL",
      note: "Only when BC refund evidence exists; CUT H usage ledger DISABLED",
    },
    end: {
      table: "store_paid_ad_campaigns",
      fields: "lifecycle_status, end_at",
      verdict: "PROVEN",
      note: "",
    },
  },
  {
    productKey: "community_banner",
    application: {
      table: "feed_ad_requests | feed_ad_campaigns",
      fields: "user_id / created_by, source",
      verdict: "PROVEN",
      note: "Member vs ADMIN_DIRECT",
    },
    payment: {
      table: "feed_ad_requests.point_cost + holds",
      fields: "point_cost",
      verdict: "PROVEN",
      note: "Admin Direct = none; never feed_ad_products current",
    },
    approval: {
      table: "feed_ad_requests",
      fields: "reviewed_by, reviewed_at, status",
      verdict: "PROVEN",
      note: "Admin Direct: no approval lifecycle",
    },
    operations: {
      table: "feed_ad_campaigns",
      fields: "status, admin_memo, updated_at",
      verdict: "PARTIAL",
      note: "Actor id not on campaign row",
    },
    runtime: {
      table: "campaign window + status",
      fields: "start_at, end_at, status",
      verdict: "GAP",
      note: "Impression table GAP — schedule_only",
    },
    refund: {
      table: "hold RELEASE on reject",
      fields: "—",
      verdict: "PARTIAL",
      note: "End refund GAP — do not invent",
    },
    end: {
      table: "feed_ad_campaigns + request sync",
      fields: "status=ended, end_at",
      verdict: "PROVEN",
      note: "",
    },
  },
  {
    productKey: "trade_banner",
    application: {
      table: "feed_ad_requests | feed_ad_campaigns",
      fields: "domain=trade",
      verdict: "PROVEN",
      note: "Same schema as community banner",
    },
    payment: {
      table: "feed_ad_requests.point_cost",
      fields: "point_cost",
      verdict: "PROVEN",
      note: "",
    },
    approval: {
      table: "feed_ad_requests",
      fields: "reviewed_*",
      verdict: "PROVEN",
      note: "",
    },
    operations: {
      table: "feed_ad_campaigns",
      fields: "status",
      verdict: "PARTIAL",
      note: "Actor NOT_PROVEN",
    },
    runtime: {
      table: "schedule",
      fields: "—",
      verdict: "GAP",
      note: "Impression GAP",
    },
    refund: {
      table: "RELEASE on reject",
      fields: "—",
      verdict: "PARTIAL",
      note: "End refund GAP",
    },
    end: {
      table: "feed_ad_campaigns",
      fields: "ended",
      verdict: "PROVEN",
      note: "",
    },
  },
  {
    productKey: "delivery_home_banner",
    application: {
      table: "store_banner_ad_campaigns",
      fields: "campaign_source, owner_user_id",
      verdict: "PROVEN",
      note: "",
    },
    payment: {
      table: "commercial snapshots + BC",
      fields: "final_payable_minor",
      verdict: "PROVEN",
      note: "Admin Direct no charge",
    },
    approval: {
      table: "delivery_ad_audit_logs",
      fields: "action, actor_*",
      verdict: "PROVEN",
      note: "",
    },
    operations: {
      table: "delivery_ad_audit_logs",
      fields: "—",
      verdict: "PROVEN",
      note: "",
    },
    runtime: {
      table: "delivery_ad_impression_events",
      fields: "—",
      verdict: "PARTIAL",
      note: "",
    },
    refund: {
      table: "BC reject refund",
      fields: "refund_ledger_id",
      verdict: "PARTIAL",
      note: "",
    },
    end: {
      table: "store_banner_ad_campaigns",
      fields: "lifecycle_status, end_at",
      verdict: "PROVEN",
      note: "",
    },
  },
  {
    productKey: "popup",
    application: {
      table: "platform_popup_campaigns | platform_popup_owner_requests",
      fields: "created_by / owner_user_id",
      verdict: "PROVEN",
      note: "Canonical new = Admin Direct; owner path = LEGACY",
    },
    payment: {
      table: "owner request price_minor | admin none",
      fields: "price_minor, payment_status",
      verdict: "LEGACY",
      note: "Admin Direct: NONE; owner historical BC only",
    },
    approval: {
      table: "audit_logs + approval_status",
      fields: "approved_by, approved_at",
      verdict: "PARTIAL",
      note: "Admin Direct: no human approval workflow for new sales SSOT",
    },
    operations: {
      table: "audit_logs + campaign status",
      fields: "status transitions",
      verdict: "PARTIAL",
      note: "",
    },
    runtime: {
      table: "platform_popup_campaign_events",
      fields: "event_type, created_at",
      verdict: "PROVEN",
      note: "Actual events when present",
    },
    refund: {
      table: "owner payment_status=refunded",
      fields: "—",
      verdict: "LEGACY",
      note: "Only when stored; never infer from reject alone without payment evidence",
    },
    end: {
      table: "platform_popup_campaigns",
      fields: "status=ended, end_at",
      verdict: "PROVEN",
      note: "",
    },
  },
];

export const ADS_HISTORY_EXPORT_AVAILABLE = false as const;
