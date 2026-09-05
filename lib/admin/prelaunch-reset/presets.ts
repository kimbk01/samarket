import type { PrelaunchResetPreset } from "@/lib/admin/prelaunch-reset/types";
import type { PrelaunchResetDomainId } from "@/lib/admin/prelaunch-reset/domain-inventory";

export type PrelaunchPresetSpec = {
  id: PrelaunchResetPreset;
  titleKo: string;
  titleEn: string;
  includes: readonly PrelaunchResetDomainId[];
  excludesByDefault: readonly string[];
  requiresExplicitMember: boolean;
  requiresExplicitStore: boolean;
  /** CUT H: execute only when finance/gift/order counts are 0 for these presets. */
  executeRequiresZeroFinance: boolean;
  /**
   * FORBIDDEN — Auth delete never planned as DELETE.
   * EXPLICIT_SAFE_MEMBER — only explicit memberIds that pass protection + manual.local ownership.
   */
  executeAuthPhase: "FORBIDDEN" | "EXPLICIT_SAFE_MEMBER";
};

export const PRELAUNCH_RESET_PRESETS: Record<PrelaunchResetPreset, PrelaunchPresetSpec> = {
  TEST_CONTENT_ONLY: {
    id: "TEST_CONTENT_ONLY",
    titleKo: "테스트 콘텐츠만",
    titleEn: "Test content only",
    includes: ["TRADE", "COMMUNITY", "REPORTS"],
    excludesByDefault: [
      "finance",
      "orders",
      "auth",
      "system_config",
      "ad_registry",
      "home_category_config",
      "audit",
    ],
    requiresExplicitMember: false,
    requiresExplicitStore: false,
    executeRequiresZeroFinance: true,
    executeAuthPhase: "FORBIDDEN",
  },
  TEST_MEMBER_DATA: {
    id: "TEST_MEMBER_DATA",
    titleKo: "테스트 회원 데이터",
    titleEn: "Test member data",
    includes: ["MEMBER", "TRADE", "COMMUNITY", "MESSENGER", "NOTIFICATIONS", "CALL", "SUPPORT"],
    excludesByDefault: ["finance", "orders", "gift", "system_config", "audit"],
    requiresExplicitMember: true,
    requiresExplicitStore: false,
    executeRequiresZeroFinance: true,
    executeAuthPhase: "EXPLICIT_SAFE_MEMBER",
  },
  TEST_STORE_DATA: {
    id: "TEST_STORE_DATA",
    titleKo: "테스트 매장 데이터",
    titleEn: "Test store data",
    includes: ["STORE", "STORE_CATALOG", "ADS_DELIVERY", "SUPPORT", "COUPON", "OWNER"],
    excludesByDefault: ["settled_orders", "cash_coin", "gift", "system_config", "audit", "registry"],
    requiresExplicitMember: false,
    requiresExplicitStore: true,
    executeRequiresZeroFinance: true,
    executeAuthPhase: "FORBIDDEN",
  },
  TEST_COMMERCE_DATA: {
    id: "TEST_COMMERCE_DATA",
    titleKo: "테스트 커머스 데이터",
    titleEn: "Test commerce data",
    includes: ["ORDERS", "PAYMENTS", "SETTLEMENTS"],
    excludesByDefault: ["real_external_payment", "settled_live", "system_config"],
    requiresExplicitMember: false,
    requiresExplicitStore: true,
    executeRequiresZeroFinance: true,
    executeAuthPhase: "FORBIDDEN",
  },
  TEST_ADS_DATA: {
    id: "TEST_ADS_DATA",
    titleKo: "테스트 광고 데이터",
    titleEn: "Test ads data",
    includes: ["ADS_DELIVERY", "ADS_FEED", "POPUP", "ANALYTICS"],
    excludesByDefault: ["ad_product_registry", "placement_registry", "partner_membership", "system_config"],
    requiresExplicitMember: false,
    requiresExplicitStore: false,
    executeRequiresZeroFinance: true,
    executeAuthPhase: "FORBIDDEN",
  },
  FULL_PRELAUNCH_TEST_DATA: {
    id: "FULL_PRELAUNCH_TEST_DATA",
    titleKo: "사전 런치 테스트 데이터 전체(명시 선택만)",
    titleEn: "Full pre-launch test data (explicit only)",
    includes: [
      "TRADE",
      "COMMUNITY",
      "MEMBER",
      "STORE",
      "STORE_CATALOG",
      "ADS_DELIVERY",
      "ADS_FEED",
      "POPUP",
      "SUPPORT",
      "MESSENGER",
      "NOTIFICATIONS",
    ],
    excludesByDefault: [
      "finance_ledgers",
      "gift_value",
      "settled_orders",
      "system_config",
      "registries",
      "audit",
      "non_manual_local_auth",
    ],
    requiresExplicitMember: true,
    requiresExplicitStore: true,
    executeRequiresZeroFinance: true,
    executeAuthPhase: "EXPLICIT_SAFE_MEMBER",
  },
};

export const PRELAUNCH_PROTECTED_TABLE_HINTS = [
  "audit_logs",
  "admin_memberships",
  "stores_home_shelf_configs",
  "stores_browse_scope_policies",
  "delivery_ad_inventory",
  "feed_ad_products",
] as const;
