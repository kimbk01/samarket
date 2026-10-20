/**
 * DIBAY Admin Real Operation — CUT J DOMAIN / COMMON OPERATION IA SEPARATION
 *
 * Nav SSOT only. No new domain DB / wallet / ads-v2 / support inbox / shell.
 * Gate: `npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock`
 * Doc: `docs/dibay-admin-real-operation-cut-j-ia-separation-hard-lock.md`
 *
 * J-AMD-1: `members` immediately after `dashboard` (Owner-approved; menu implemented).
 * J-AMD-3: Delivery workspace operator-task sections (Owner-approved A-1; menu implemented).
 * J-AMD-4: Chat (messenger) workspace sections (Owner-approved O-C12; menu implemented).
 * J-AMD-5: Common-menu restructure (Owner-approved 2026-10-20, design v4 O-1..O-3; menu implemented).
 */

export const ADMIN_REAL_OPERATION_CUT_J_LOCK_ID =
  "dibay-admin-real-operation-cut-j-ia-separation-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_J_LOCKED = true as const;

/**
 * Live-enforced top-level workspace order (must match `adminMenu` keys).
 * J-AMD-1: members after dashboard; all other relative order preserved.
 */
export const CUT_J_WORKSPACE_ORDER = [
  "dashboard",
  "members",
  "delivery",
  "trade",
  "community",
  "messenger",
  "finance",
  "ads",
  "promotion",
  "support",
  "notifications",
  "system",
] as const;

/** @deprecated Use CUT_J_WORKSPACE_ORDER — kept as alias for J-AMD-1 target docs/tests. */
export const CUT_J_WORKSPACE_ORDER_J_AMD_1 = CUT_J_WORKSPACE_ORDER;

export const CUT_J_J_AMD_1_OWNER_APPROVED = true as const;

export const CUT_J_J_AMD_1_STATUS = "OWNER_APPROVED_IMPLEMENTED" as const;

/** URL-preserving members leaves (J-AMD-1). */
export const CUT_J_J_AMD_1_MEMBERS_LEAVES = [
  { key: "users", path: "/admin/users" },
  { key: "global-reports", path: "/admin/reports" },
  { key: "reports-logs", path: "/admin/reports/log" },
  { key: "audit-logs", path: "/admin/audit-logs" },
] as const;

/** Explicit Owner rejects (do not implement under this amendment). */
export const CUT_J_J_AMD_1_REJECTED = {
  fullWorkspaceReorder_J_AMD_2: true,
  adsPromotionSingleParent_B_X1: true,
  cutJFullUnlock: true,
} as const;

export const CUT_J_J_AMD_3_OWNER_APPROVED = true as const;

export const CUT_J_J_AMD_3_STATUS = "OWNER_APPROVED_IMPLEMENTED" as const;

/**
 * J-AMD-3 — Delivery workspace tree (direct children of `delivery`, in order).
 * Section nodes are header-only (no path). Leaf keys / paths / status unchanged
 * except the added `store-inquiries-admin` leaf. Workspace order unchanged.
 */
export const CUT_J_J_AMD_3_DELIVERY_TREE = [
  { key: "delivery-dashboard", children: [] },
  {
    key: "delivery-section-stores",
    children: [
      "stores-commerce",
      "business-shops",
      "store-products-admin",
      "store-inquiries-admin",
      "store-reports-admin",
      "store-reviews-admin",
    ],
  },
  {
    key: "delivery-orders",
    children: [
      "delivery-orders-list",
      "delivery-orders-action-queue",
      "delivery-orders-cancel",
      "delivery-orders-refund",
      "delivery-orders-logs",
      "delivery-order-chats",
    ],
  },
  {
    key: "delivery-section-field",
    children: [
      "delivery-ops-console",
      "delivery-operations-stats",
      "delivery-riders-ops",
      "delivery-operation-alerts",
      "delivery-auto-actions",
    ],
  },
  {
    key: "delivery-section-fees",
    children: ["store-fee-policies-admin", "store-settlements-admin"],
  },
  {
    key: "delivery-section-promotions",
    children: ["store-coupon-control-center", "gift-certificates", "store-promo-control"],
  },
  {
    key: "delivery-section-home-layout",
    children: [
      "stores-home-shelves",
      "stores-industries-management",
      "stores-browse-policy",
      "delivery-bottom-nav",
    ],
  },
  {
    key: "delivery-section-settings",
    children: [
      "delivery-distance",
      "store-settings-alerts",
      "commerce-settings-admin",
      "store-payment-events-admin",
    ],
  },
] as const;

/** J-AMD-3 — added primary leaf (route existed; previously hidden from nav). */
export const CUT_J_J_AMD_3_ADDED_LEAF = {
  key: "store-inquiries-admin",
  path: "/admin/store-inquiries",
  workspace: "delivery",
  parent: "delivery-section-stores",
} as const;

/** J-AMD-3 — leaves moved out of delivery (same keys / paths). */
export const CUT_J_J_AMD_3_MOVED_OUT_OF_DELIVERY = [
  {
    key: "runtime-health",
    path: "/admin/runtime-health",
    workspace: "system",
    // J-AMD-5: `system-manage` dissolved — now a flat system leaf (master-only).
    parent: "system",
  },
  {
    key: "delivery-release-gate",
    path: "/admin/delivery-release-gate",
    workspace: "system",
    parent: "system",
  },
  {
    key: "delivery-order-notifications",
    path: "/admin/order-notifications",
    workspace: "support",
    parent: "support",
  },
] as const;

/** J-AMD-3 — old delivery section nodes removed once empty (i18n keys kept). */
export const CUT_J_J_AMD_3_REMOVED_SECTIONS = [
  "delivery-section-operations",
  "delivery-section-management",
  "delivery-section-policies",
  "delivery-section-platform",
] as const;

export const CUT_J_J_AMD_4_OWNER_APPROVED = true as const;

export const CUT_J_J_AMD_4_STATUS = "OWNER_APPROVED_IMPLEMENTED" as const;

/**
 * J-AMD-4 — Chat workspace tree (direct children of `messenger`, in order).
 * Doc: `docs/admin/dibay-admin-chat-audit-design.md` §2 (O-C12).
 * Section nodes are header-only. Keys unchanged; 「거래」「배달 주문」 are type filters of
 * 전체채팅 (`/admin/chats?type=…`) — the old `?from=messenger` URLs stay as matchPaths only.
 */
/** 채팅 Admin 설계 v2 §1-3 (Owner 승인 A-10): 긴급도 순 — 대시보드 · 신고 · 통화 · 채팅방(활동량 순) · 시스템. */
export const CUT_J_J_AMD_4_MESSENGER_TREE = [
  { key: "messenger-hub", children: [] },
  { key: "messenger-section-reports", children: ["chat-reported"] },
  { key: "messenger-section-calls", children: ["chat-messenger"] },
  {
    key: "messenger-section-rooms",
    children: [
      "chat-all",
      "chat-trade-messenger",
      "delivery-order-chats-messenger",
      "chat-general",
      "chat-group",
    ],
  },
  { key: "messenger-section-system", children: ["chat-messenger-perf", "ops-docs-chat"] },
] as const;

/** J-AMD-4 — reference leaves re-pointed from `?from=messenger` duplicates to 전체채팅 type filters. */
export const CUT_J_J_AMD_4_REPOINTED_LEAVES = [
  {
    key: "chat-trade-messenger",
    path: "/admin/chats?type=trade",
    legacyMatchPath: "/admin/chats/trade?from=messenger",
  },
  {
    key: "delivery-order-chats-messenger",
    path: "/admin/chats?type=store_order",
    legacyMatchPath: "/admin/order-chats?from=messenger",
  },
] as const;

/** J-AMD-4 — leaves moved into the chat workspace (same keys / paths). */
export const CUT_J_J_AMD_4_MOVED_INTO_MESSENGER = [
  {
    key: "ops-docs-chat",
    path: "/admin/docs/chat",
    workspace: "messenger",
    parent: "messenger-section-system",
  },
] as const;

/** J-AMD-4 — old chat section node removed once empty (i18n key kept). */
export const CUT_J_J_AMD_4_REMOVED_SECTIONS = ["messenger-advanced"] as const;

/** J-AMD-4 — redirect-only routes (never menu leaves). */
export const CUT_J_J_AMD_4_REDIRECTS = [
  { from: "/admin/chats/trade-complete", to: "/admin/trade-flow?panel=complete" },
] as const;

export const CUT_J_J_AMD_5_OWNER_APPROVED = true as const;

export const CUT_J_J_AMD_5_STATUS = "OWNER_APPROVED_IMPLEMENTED" as const;

/** J-AMD-5 source: Owner-approved 2026-10-20 design v4 (O-1 · O-2 · O-3), §1 + appendix (195 rows). */
export const CUT_J_J_AMD_5_SOURCE = "docs/admin/dibay-admin-unified-operations-design-v4.html" as const;

/**
 * J-AMD-5 (O-1) — workspace order unchanged; display labels change via i18n VALUES only
 * (workspace keys and i18n keys unchanged).
 */
export const CUT_J_J_AMD_5_WORKSPACE_LABELS = [
  { key: "dashboard", titleKey: "admin_menu_home", ko: "운영 홈" },
  { key: "members", titleKey: "admin_menu_members", ko: "회원·권한" },
  { key: "delivery", titleKey: "admin_menu_delivery", ko: "배달·매장" },
  { key: "finance", titleKey: "admin_menu_finance", ko: "결제·정산" },
  { key: "ads", titleKey: "admin_menu_ads", ko: "광고·배너" },
  { key: "promotion", titleKey: "admin_menu_promotion", ko: "플랫폼 운영" },
] as const;

/**
 * J-AMD-5 — members leaves (in order, design v4: 4 → 7). Two existing sub-screens exposed +
 * 「관리자 계정·권한」 `/admin/staff` (F3 new screen, master-only — APIs require super_admin).
 */
export const CUT_J_J_AMD_5_MEMBERS_LEAVES = [
  { key: "users", path: "/admin/users" },
  { key: "users-phone-verification", path: "/admin/users/phone-verification" },
  { key: "users-deletion-requests", path: "/admin/users/deletion-requests" },
  { key: "global-reports", path: "/admin/reports" },
  { key: "reports-logs", path: "/admin/reports/log" },
  { key: "audit-logs", path: "/admin/audit-logs" },
  { key: "admin-staff", path: "/admin/staff" },
] as const;

/** J-AMD-5 (F3) — new members leaf: new route, super_admin only (menu `roles: ["master"]`). */
export const CUT_J_J_AMD_5_ADDED_STAFF_LEAF = {
  key: "admin-staff",
  path: "/admin/staff",
  workspace: "members",
  roles: ["master"],
  titleKey: "admin_menu_admin_staff",
} as const;

/**
 * J-AMD-5 (O-2) — promotion (「플랫폼 운영」) tree, direct children in order.
 * Section nodes are header-only; section keys reused (settings-startup = 앱 화면 구성,
 * growth-rec = 추천, cp-content = 공통 콘텐츠). Leaf keys / paths unchanged.
 */
export const CUT_J_J_AMD_5_PROMOTION_TREE = [
  { key: "promotion-home", children: [] },
  { key: "promotion-events", children: [] },
  { key: "promotion-popup", children: [] },
  { key: "promotion-ptr-ads", children: [] },
  { key: "promotion-banners", children: [] },
  { key: "promotion-owner-requests", children: [] },
  {
    key: "settings-startup",
    children: [
      "settings-os-start",
      "settings-intro",
      "settings-startup-config",
      "menu-main-bottom-nav",
      "my-banners",
      "my-sections",
      "my-services",
    ],
  },
  {
    key: "growth-rec",
    children: [
      "manage-ab",
      "rec-analytics",
      "rec-monitoring",
      "rec-deployments",
      "rec-automation",
      "manage-reports",
    ],
  },
  { key: "cp-content", children: ["cp-notice", "cp-faq", "cp-legal", "cp-business"] },
] as const;

/** J-AMD-5 (O-3) — master-only 「내부 도구」 section (reused key `platform-system`). */
export const CUT_J_J_AMD_5_INTERNAL_TOOLS_SECTION = {
  key: "platform-system",
  roles: ["master"],
} as const;

/** J-AMD-5 (O-3) — the 24 internal tools (in order). URLs / pages kept. */
export const CUT_J_J_AMD_5_INTERNAL_TOOLS = [
  { key: "manage-ops-board", path: "/admin/ops-board" },
  { key: "manage-docs", path: "/admin/ops-docs" },
  { key: "manage-runbooks", path: "/admin/ops-runbooks" },
  { key: "manage-kb", path: "/admin/ops-knowledge" },
  { key: "manage-kg", path: "/admin/ops-knowledge-graph" },
  { key: "manage-learning", path: "/admin/ops-learning" },
  { key: "manage-maturity", path: "/admin/ops-maturity" },
  { key: "manage-benchmarks", path: "/admin/ops-benchmarks" },
  { key: "system-qa", path: "/admin/qa-board" },
  { key: "system-longrun", path: "/admin/ops-routines" },
  { key: "system-backlog", path: "/admin/product-backlog" },
  { key: "system-sprint", path: "/admin/dev-sprints" },
  { key: "system-release-notes", path: "/admin/release-notes" },
  { key: "system-release-archive", path: "/admin/release-archive" },
  { key: "system-release-migration", path: "/admin/production-migration" },
  { key: "system-backup", path: "/admin/backup" },
  { key: "system-dr", path: "/admin/dr" },
  { key: "system-automation", path: "/admin/automation" },
  { key: "ops-launch-readiness", path: "/admin/launch-readiness" },
  { key: "ops-launch-week", path: "/admin/launch-week" },
  { key: "system-security", path: "/admin/security" },
  { key: "system-performance", path: "/admin/performance" },
  { key: "system-usage", path: "/admin/usage" },
  { key: "ops-memo", path: "/admin/memo" },
] as const;

/**
 * J-AMD-5 — system tree (direct children in order). Leaves that were master-only before
 * (inside `platform-system`) keep `roles: ["master"]` — no menu visibility change.
 * `ops-docs-board` (운영 가이드) is outside any role-restricted section (all admins).
 */
export const CUT_J_J_AMD_5_SYSTEM_TREE = [
  { key: "cp-dashboard", children: [] },
  { key: "cp-monitoring", children: [] },
  { key: "system-status", children: [] },
  { key: "runtime-health", children: [] },
  { key: "delivery-release-gate", children: [] },
  { key: "system-deploy", children: [] },
  { key: "settings-general", children: [] },
  { key: "settings-auth", children: [] },
  { key: "system-hotfix", children: [] },
  { key: "system-prelaunch-reset", children: [] },
  { key: "ops-docs-board", children: [] },
  { key: "app-countries", children: [] },
  { key: "app-languages", children: [] },
  { key: "app-meta", children: [] },
  {
    key: "platform-system",
    children: [
      "manage-ops-board",
      "manage-docs",
      "manage-runbooks",
      "manage-kb",
      "manage-kg",
      "manage-learning",
      "manage-maturity",
      "manage-benchmarks",
      "system-qa",
      "system-longrun",
      "system-backlog",
      "system-sprint",
      "system-release-notes",
      "system-release-archive",
      "system-release-migration",
      "system-backup",
      "system-dr",
      "system-automation",
      "ops-launch-readiness",
      "ops-launch-week",
      "system-security",
      "system-performance",
      "system-usage",
      "ops-memo",
    ],
  },
] as const;

/** J-AMD-5 — system leaves that keep their previous master-only visibility. */
export const CUT_J_J_AMD_5_MASTER_ONLY_SYSTEM_LEAVES = [
  "system-status",
  "runtime-health",
  "delivery-release-gate",
  "system-deploy",
  "system-hotfix",
  "system-prelaunch-reset",
] as const;

/** J-AMD-5 (O-8) — hidden via `sidebarPublic: false` (code / URL / key kept). */
export const CUT_J_J_AMD_5_HIDDEN_LEAVES = [
  { key: "cp-faq", path: "/admin/customer-platform/faq" },
  { key: "app-countries", path: "/admin/app/countries" },
  { key: "app-languages", path: "/admin/app/languages" },
  { key: "app-meta", path: "/admin/app/meta" },
] as const;

/**
 * J-AMD-5 (O-2) — duplicate leaves removed from the menu. URLs keep working and stay
 * highlightable through `coveredBy` (its path prefix or matchPaths).
 */
export const CUT_J_J_AMD_5_REMOVED_LEAVES = [
  {
    key: "cp-action-queue",
    path: "/admin/customer-platform#action-queue",
    coveredBy: "cp-dashboard",
    via: "path-prefix",
  },
  {
    key: "app-categories",
    path: "/admin/categories",
    coveredBy: "menu-trade",
    via: "matchPaths",
  },
  {
    key: "promotion-notifications",
    path: "/admin/platform-promotion/notifications",
    coveredBy: "cp-notification-engine",
    via: "matchPaths",
  },
] as const;

/** J-AMD-5 — leaves moved from system into promotion (same keys / paths). */
export const CUT_J_J_AMD_5_MOVED_INTO_PROMOTION = [
  "settings-startup-config",
  "menu-main-bottom-nav",
  "my-banners",
  "my-sections",
  "my-services",
  "manage-ab",
  "rec-analytics",
  "rec-monitoring",
  "rec-deployments",
  "rec-automation",
  "manage-reports",
  "cp-notice",
  "cp-faq",
  "cp-legal",
  "cp-business",
] as const;

/** J-AMD-5 — old section nodes removed once empty (i18n keys kept). */
export const CUT_J_J_AMD_5_REMOVED_SECTIONS = [
  "customer-platform",
  "app-config",
  "platform-ops",
  "manage",
  "manage-knowledge",
  "manage-eval",
  "system-release",
  "system-manage",
] as const;

export const CUT_J_NAV_SSOT = {
  menuTreeAuthority: "components/admin/admin-menu.ts",
  workspaceRoutingAuthority: "lib/admin/admin-workspace-routing.ts",
  shellAuthority: ["AdminPlatformShell", "AdminWorkspaceNav", "AdminWorkspaceSidebar"] as const,
  dissolvedWorkspaces: ["common", "growth"] as const,
  duplicatePrimaryLeafForbidden: true,
  newShellRoutesForbidden: [
    "/admin/ads-v2",
    "/admin/growth-v2",
    "/admin/finance-v2",
    "/admin/support-v2",
    "/admin/control-plane-v2",
  ] as const,
} as const;

/** Config stays domain-owned; ads ops is common UX entry. */
export const CUT_J_CONFIG_VS_OPERATION = {
  homeConfigRoute: "/admin/stores-home-shelves",
  homeConfigWorkspace: "delivery",
  categoryConfigRoute: "/admin/stores-category-policy",
  categoryConfigWorkspace: "delivery",
  deliveryAdsOpsRoute: "/admin/delivery-ads/manage",
  deliveryAdsOpsWorkspace: "ads",
  placementMapRoute: "/admin/delivery-ads/inventory#placement-map",
  placementMapWorkspace: "ads",
  placementMapIsConfigWriter: false,
} as const;

export const CUT_J_LEGACY_PRIMARY_FORBIDDEN = {
  platformInquiriesPrimary: "/admin/platform-inquiries",
  ast002StorePointChargesMenuKey: "store-point-charges-admin",
  growthWorkspaceKey: "growth",
  commonWorkspaceKey: "common",
} as const;

/** CUT I Production P0 carry — do not delete or re-claim as PASS in CUT J. */
export const CUT_I_CARRY_INTO_J = {
  financeF1F3F4F7: "NOT_PROVEN",
  coinSaleRecognition: "NOT_PROVEN",
  adsApplyActiveApp: "NOT_PROVEN",
  pauseResumeEnd: "NOT_PROVEN",
  popupRuntime: "NOT_PROVEN",
  actionCenterProductionUi: "PARTIAL",
  placementActiveEligibility: "PARTIAL",
  creativeLiveParity: "PARTIAL",
  tabletRealDevice: "NOT_PROVEN",
  resetStorage: "NOT_IMPLEMENTED",
  resetAuth: "NOT_IMPLEMENTED",
  resetOverall: "PARTIAL",
} as const;

export function assertAdminRealOperationCutJIaSeparationHardLock(): boolean {
  const order = [...CUT_J_WORKSPACE_ORDER];
  const jAmd1Ok =
    order[0] === "dashboard" &&
    order[1] === "members" &&
    CUT_J_J_AMD_1_OWNER_APPROVED === true &&
    CUT_J_J_AMD_1_REJECTED.fullWorkspaceReorder_J_AMD_2 === true &&
    CUT_J_J_AMD_1_REJECTED.adsPromotionSingleParent_B_X1 === true &&
    CUT_J_J_AMD_1_REJECTED.cutJFullUnlock === true &&
    CUT_J_J_AMD_1_MEMBERS_LEAVES.length === 4;

  const jAmd3Ok =
    CUT_J_J_AMD_3_OWNER_APPROVED === true &&
    CUT_J_J_AMD_3_DELIVERY_TREE[0].key === "delivery-dashboard" &&
    CUT_J_J_AMD_3_DELIVERY_TREE.length === 8 &&
    CUT_J_J_AMD_3_MOVED_OUT_OF_DELIVERY.length === 3;

  const jAmd4Ok =
    CUT_J_J_AMD_4_OWNER_APPROVED === true &&
    CUT_J_J_AMD_4_MESSENGER_TREE[0].key === "messenger-hub" &&
    CUT_J_J_AMD_4_MESSENGER_TREE.length === 5 &&
    CUT_J_J_AMD_4_REPOINTED_LEAVES.every((l) => !l.path.includes("from=messenger"));

  const jAmd5Ok =
    CUT_J_J_AMD_5_OWNER_APPROVED === true &&
    CUT_J_J_AMD_5_INTERNAL_TOOLS.length === 24 &&
    CUT_J_J_AMD_5_MEMBERS_LEAVES.length === 7 &&
    CUT_J_J_AMD_5_MEMBERS_LEAVES[6].path === CUT_J_J_AMD_5_ADDED_STAFF_LEAF.path &&
    CUT_J_J_AMD_5_INTERNAL_TOOLS_SECTION.roles.length === 1 &&
    CUT_J_J_AMD_5_INTERNAL_TOOLS_SECTION.roles[0] === "master" &&
    CUT_J_J_AMD_5_REMOVED_LEAVES.length === 3 &&
    CUT_J_J_AMD_5_HIDDEN_LEAVES.length === 4 &&
    CUT_J_J_AMD_5_PROMOTION_TREE[0].key === "promotion-home";

  return (
    ADMIN_REAL_OPERATION_CUT_J_LOCKED === true &&
    CUT_J_NAV_SSOT.duplicatePrimaryLeafForbidden === true &&
    CUT_J_CONFIG_VS_OPERATION.placementMapIsConfigWriter === false &&
    CUT_J_CONFIG_VS_OPERATION.homeConfigWorkspace === "delivery" &&
    CUT_J_CONFIG_VS_OPERATION.deliveryAdsOpsWorkspace === "ads" &&
    CUT_I_CARRY_INTO_J.financeF1F3F4F7 === "NOT_PROVEN" &&
    CUT_I_CARRY_INTO_J.adsApplyActiveApp === "NOT_PROVEN" &&
    CUT_I_CARRY_INTO_J.resetStorage === "NOT_IMPLEMENTED" &&
    jAmd1Ok &&
    jAmd3Ok &&
    jAmd4Ok &&
    jAmd5Ok
  );
}
