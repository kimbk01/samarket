/**
 * CUT H — Pre-launch Reset domain inventory (read/SSOT).
 * Not a deletion executor. Documents reset eligibility vs protected.
 */

export type PrelaunchResetDomainId =
  | "AUTH"
  | "MEMBER"
  | "OWNER"
  | "STORE"
  | "STORE_CATALOG"
  | "ORDERS"
  | "PAYMENTS"
  | "SETTLEMENTS"
  | "POINT"
  | "COIN"
  | "CASH"
  | "ADS_DELIVERY"
  | "ADS_FEED"
  | "POPUP"
  | "PARTNER"
  | "SUPPORT"
  | "MESSENGER"
  | "CALL"
  | "COMMUNITY"
  | "TRADE"
  | "COUPON"
  | "GIFT"
  | "NOTIFICATIONS"
  | "REPORTS"
  | "ANALYTICS"
  | "AUDIT"
  | "STORAGE"
  | "SYSTEM_CONFIG";

export type PrelaunchDomainInventoryRow = {
  id: PrelaunchResetDomainId;
  tablesHint: readonly string[];
  systemData: boolean;
  userData: boolean;
  financialData: boolean;
  auditData: boolean;
  resetEligibleDefault: boolean;
  protectedDefault: boolean;
  notes: string;
};

/** Inventory for Admin Reset planning — delete order is planner-owned, not this list alone. */
export const PRELAUNCH_RESET_DOMAIN_INVENTORY: readonly PrelaunchDomainInventoryRow[] = [
  {
    id: "SYSTEM_CONFIG",
    tablesHint: ["app_settings", "admin_memberships", "stores_home_shelves", "stores_category_policy"],
    systemData: true,
    userData: false,
    financialData: false,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "HOME/CATEGORY composition + admin membership + settings — NEVER reset",
  },
  {
    id: "AUDIT",
    tablesHint: ["audit_logs"],
    systemData: true,
    userData: false,
    financialData: false,
    auditData: true,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Reset audit must survive reset",
  },
  {
    id: "AUTH",
    tablesHint: ["auth.users"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Auth delete last; not DB-atomic with public rows. CUT H execute: NOT implemented as default.",
  },
  {
    id: "MEMBER",
    tablesHint: ["profiles"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Explicit memberIds only; MASTER/current admin protected",
  },
  {
    id: "STORE",
    tablesHint: ["stores"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Explicit storeIds; finance/order gates apply",
  },
  {
    id: "STORE_CATALOG",
    tablesHint: ["store_products", "store_menus"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Child of STORE selector",
  },
  {
    id: "ORDERS",
    tablesHint: ["store_orders", "order_items"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Settled/completed orders blocked by default",
  },
  {
    id: "PAYMENTS",
    tablesHint: ["store_payment_events"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "External provider refs → BLOCK",
  },
  {
    id: "SETTLEMENTS",
    tablesHint: ["store_settlements"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Settled money — blocked",
  },
  {
    id: "POINT",
    tablesHint: ["point_ledger", "point_charge_requests"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Never casual delete; ambiguous ownership → BLOCK",
  },
  {
    id: "COIN",
    tablesHint: ["business_coin_accounts", "business_coin_ledger"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Economic asset — BLOCK unless proven isolated test",
  },
  {
    id: "CASH",
    tablesHint: ["business_cash_accounts", "business_cash_ledger", "business_cash_charge_requests"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Cash top-up/debit — BLOCK by default",
  },
  {
    id: "ADS_DELIVERY",
    tablesHint: ["delivery_ad_campaigns", "delivery_ad_creatives"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Executions only; inventory/product registry protected",
  },
  {
    id: "ADS_FEED",
    tablesHint: ["feed_ad_campaigns", "feed_ad_requests"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Separate from Delivery",
  },
  {
    id: "POPUP",
    tablesHint: ["platform_popup_campaigns", "platform_popup_owner_requests"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Separate domain",
  },
  {
    id: "PARTNER",
    tablesHint: ["delivery_ad_partner_memberships"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Membership money — conservative block",
  },
  {
    id: "SUPPORT",
    tablesHint: ["support_cases", "support_messages"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Entity-scoped only; no inbox wipe",
  },
  {
    id: "MESSENGER",
    tablesHint: ["community_messenger_rooms", "community_messenger_messages"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Related threads only; no global wipe",
  },
  {
    id: "CALL",
    tablesHint: ["community_messenger_call_signals"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "User-scoped sessions only",
  },
  {
    id: "COMMUNITY",
    tablesHint: ["community_posts", "community_comments"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "TEST_CONTENT_ONLY primary",
  },
  {
    id: "TRADE",
    tablesHint: ["posts", "post_comments"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Listings/content; not payment",
  },
  {
    id: "COUPON",
    tablesHint: ["store_coupons"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Order-linked coupons need gate",
  },
  {
    id: "GIFT",
    tablesHint: ["gift_certificate_instances"],
    systemData: false,
    userData: true,
    financialData: true,
    auditData: false,
    resetEligibleDefault: false,
    protectedDefault: true,
    notes: "Cash-like asset — exclude by default",
  },
  {
    id: "NOTIFICATIONS",
    tablesHint: ["notifications", "push_devices"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "User/device scoped; no global device wipe",
  },
  {
    id: "REPORTS",
    tablesHint: ["reports"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Entity-scoped",
  },
  {
    id: "ANALYTICS",
    tablesHint: ["delivery_ad_impressions"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Optional; not deploy/health logs",
  },
  {
    id: "STORAGE",
    tablesHint: ["storage.objects"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Entity-derived prefixes only; bucket purge forbidden",
  },
  {
    id: "OWNER",
    tablesHint: ["store_owners"],
    systemData: false,
    userData: true,
    financialData: false,
    auditData: false,
    resetEligibleDefault: true,
    protectedDefault: false,
    notes: "Tied to STORE/MEMBER selectors",
  },
] as const;

/** Forbidden legacy path — must never be wired to Admin UI. */
export const PRELAUNCH_RESET_FORBIDDEN_OPS = {
  truncateCascadePublic: "supabase/scripts/wipe-all-app-data.sql",
  schemaWipe: true,
  authUsersFullDelete: true,
  bucketWidePurge: true,
  singleAllDeleteButton: true,
  sqlFromAdminUi: true,
} as const;
