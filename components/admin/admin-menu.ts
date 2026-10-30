/**
 * 플랫폼 Admin 메뉴 SSOT (CUT J workspaces)
 * LOCK: docs/admin/platform-admin-ia-lock.md
 *
 * Workspaces:
 * dashboard · delivery · trade · community · messenger ·
 * finance · ads · promotion · support · notifications · system
 *
 * J-AMD-5 (design v4 O-1..O-3): group labels renamed via i18n values only; system → 플랫폼 운영
 * sections (앱 화면 구성 · 추천 · 공통 콘텐츠); master-only 「내부 도구」 under system.
 *
 * Invariants:
 * - path(쿼리·hash 포함) 하나당 visible leaf 하나
 * - redirect-only route는 leaf 금지
 * - section header는 path 없음 (parent === first-child URL 금지)
 * - pendingRoute: 페이지 없는 항목은 FAQ만 허용(기존 CP 계약)
 */

import type { MessageKey } from "@/lib/i18n/messages";

export type AdminMenuRole = "master" | "admin" | "operator" | "viewer";

/** 메뉴 연결 상태: 완료 / 부분 / 미연결. 미지정 시 하위로부터 자동 계산 */
export type AdminMenuStatus = "done" | "partial" | "todo";

export interface AdminMenuItem {
  key: string;
  title: string;
  titleKey?: MessageKey;
  /** canonical path — leaf만. section header는 생략 */
  path?: string;
  /** active 판정용 추가 path (별도 메뉴 노드 아님) */
  matchPaths?: string[];
  /**
   * If true, `path` matches only the exact pathname (no `/child` prefix match).
   * Used so Ads 관제 (`/admin/delivery-ads`) does not steal active state from
   * Delivery ops detail (`/admin/delivery-ads/[id]`).
   */
  exactPath?: true;
  /**
   * Active when current pathname is under one of these prefixes
   * (loses to longer exact siblings in the same scope).
   */
  matchPathPrefixes?: string[];
  icon?: string;
  roles?: AdminMenuRole[];
  children?: AdminMenuItem[];
  /** true면 해당 path 페이지 미구현 — UI에서 muted 표시 */
  pendingRoute?: true;
  /** 연결 상태. 미지정이면 하위 메뉴 기준 자동 계산 */
  status?: AdminMenuStatus;
  /**
   * false면 PUBLIC sidebar에서 숨김 (deep-link / findAdminMenuByKey KEEP).
   * Ads SSOT: ads-legacy retired from PUBLIC nav; canonical 7 leaves remain.
   */
  sidebarPublic?: boolean;
  /**
   * 진입점 별칭 (재감사 E-8 · Owner 승인 2026-10-30) — 같은 화면의 원래 메뉴(canonical)는 다른 워크스페이스에 있다.
   * 별칭으로 들어오면 그 워크스페이스를 기억해 상세·편집·페이지 이동에도 유지하고(`resolveActiveWorkspace` preferred),
   * 기억이 없을 때(주소 직접 입력)는 원래 메뉴가 이긴다. 원장·화면·URL 은 하나다.
   */
  entryAlias?: true;
}

const ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY: Partial<Record<string, MessageKey>> = {
  // Workspaces
  dashboard: "admin_menu_home",
  home: "admin_menu_home",
  members: "admin_menu_members",
  common: "admin_menu_common",
  "customer-platform": "admin_menu_customer_platform",
  community: "admin_menu_community",
  trade: "admin_menu_trade",
  delivery: "admin_menu_delivery",
  messenger: "admin_menu_messenger",
  finance: "admin_menu_finance",
  ads: "admin_menu_ads",
  promotion: "admin_menu_promotion",
  "promotion-home": "admin_menu_promotion_home",
  "promotion-events": "admin_menu_promotion_events",
  "promotion-popup": "admin_menu_promotion_popup",
  "promotion-ptr-ads": "admin_menu_promotion_ptr_ads",
  "promotion-banners": "admin_menu_promotion_banners",
  "promotion-notifications": "admin_menu_promotion_notifications",
  "promotion-owner-requests": "admin_menu_promotion_owner_requests",
  support: "admin_menu_support",
  notifications: "admin_menu_notifications",
  system: "admin_menu_system",
  growth: "admin_menu_growth",
  "app-config": "admin_menu_app_config",
  "platform-ops": "admin_menu_platform_ops",

  // CUT J sections
  "finance-member-point": "admin_menu_cp_points_member",
  // Admin IA R1 (IA-05): 허브 「재무 관제」와 라벨 중복 해소
  "finance-store-currency": "admin_menu_finance_store_section",
  "ads-delivery-ops": "admin_menu_ads_delivery",
  "ads-authority-boosts": "admin_menu_ads_authority_boosts",
  "ads-authority-applications": "admin_menu_ads_authority_applications",
  "ads-authority-operations": "admin_menu_ads_authority_operations",
  "ads-authority-placements": "admin_menu_ads_authority_placements_inventory",
  "ads-authority-products": "admin_menu_ads_authority_products",
  "ads-authority-history": "admin_menu_ads_authority_history",
  "ads-placement-map": "admin_menu_placement_map",
  "ads-trade-promote": "admin_menu_ads_promote_group",
  "ads-applications-group": "admin_menu_ads_applications_group",
  "ads-execution-group": "admin_menu_ads_execution_group",
  "ads-products-group": "admin_menu_ads_products_group",
  "ads-community-promote": "admin_menu_ads_community_promote",
  "support-legacy": "admin_menu_store_inquiries",
  "system-members": "admin_menu_members",

  // CP
  "cp-dashboard": "admin_menu_cp_dashboard",
  "cp-action-queue": "admin_menu_cp_action_queue",
  "cp-monitoring": "admin_menu_cp_monitoring",
  "cp-support": "admin_menu_cp_support",
  "cp-support-center": "admin_menu_cp_support_center",
  "cp-support-archive": "admin_menu_cp_support_archive",
  "admin-inbox": "admin_inbox_title",
  "cp-store-inquiry": "admin_menu_store_inquiries",
  "cp-member-assets": "admin_menu_cp_points_member",
  "cp-store-assets": "admin_menu_store_points",
  "cp-content": "admin_menu_cp_content",
  "cp-notice": "admin_menu_notices",
  "cp-faq": "admin_menu_cp_faq",
  "cp-legal": "admin_menu_legal",
  "cp-business": "admin_menu_business",
  "cp-notification-engine": "admin_menu_dibay_notification_campaigns",
  "points-charge": "admin_menu_points_charge",
  "points-plans": "admin_menu_points_plans",
  "points-ledger": "admin_menu_points_ledger",
  "points-policy": "admin_menu_points_policy",
  "points-execute": "admin_menu_points_execute",
  "points-expire": "admin_menu_points_expire",
  "store-points-admin": "admin_menu_store_points",
  "store-point-charges-admin": "admin_menu_store_point_charges",
  "store-point-ledger-admin": "admin_menu_store_point_ledger",
  "finance-transactions": "admin_menu_finance_transactions",
  "finance-stores": "admin_menu_finance_stores",
  "finance-orders": "admin_menu_finance_orders",
  "finance-cash": "admin_menu_finance_cash",
  "finance-outstanding": "admin_menu_finance_outstanding",
  "finance-ads": "admin_menu_finance_ads",
  "finance-withdrawals": "admin_menu_finance_withdrawals",
  "finance-settings": "admin_menu_finance_settings",
  "store-point-policies-admin": "admin_menu_store_point_policies",
  "store-finance-admin": "admin_menu_store_finance",
  // Admin IA R1 (감사 2026-10-30 · Owner 권장안 승인) — 섹션·진입점 추가, 경로·원장 불변
  "members-section-accounts": "admin_menu_members_section_accounts",
  "members-section-moderation": "admin_menu_members_section_moderation",
  "members-section-admins": "admin_menu_members_section_admins",
  "member-benefits": "admin_menu_member_benefits",
  "delivery-ads-entry": "admin_menu_delivery_ads_entry",
  "ads-section-banners": "admin_menu_ads_section_banners",
  "ads-banners-overview": "admin_menu_ads_banners_overview",
  "ads-banners-promotion": "admin_menu_ads_banners_promotion",
  "ads-banners-mypage": "admin_menu_ads_banners_mypage",
  "promotion-section-campaigns": "admin_menu_promotion_section_campaigns",
  // 재감사 (2026-10-30): 광고·배너 섹션·별칭 진입점(라벨 = 원래 메뉴 라벨), 리뷰·분류 중앙 진입
  "ads-section-operations": "admin_menu_ads_section_operations",
  "ads-section-popups": "admin_menu_ads_section_popups",
  "ads-section-promotions": "admin_menu_ads_section_promotions",
  "ads-section-startup": "admin_menu_ads_section_startup",
  "ads-popups-popup": "admin_menu_promotion_popup",
  "ads-popups-ptr": "admin_menu_promotion_ptr_ads",
  "ads-promo-events": "admin_menu_promotion_events",
  "ads-promo-owner-requests": "admin_menu_promotion_owner_requests",
  "ads-promo-coupons": "admin_menu_store_coupon_control_center",
  "ads-promo-gift": "admin_menu_gift_certificates",
  "ads-promo-discovery": "admin_menu_store_promo_control",
  "ads-startup-os": "admin_menu_settings_os_start",
  "ads-startup-intro": "admin_menu_settings_intro",
  "ads-startup-config": "admin_menu_settings_startup_config",
  "members-reviews-store": "admin_menu_store_reviews",
  "members-reviews-trade": "admin_menu_trade_reviews",
  "promotion-section-taxonomy": "admin_menu_promotion_section_taxonomy",
  "taxonomy-trade": "admin_menu_taxonomy_trade",
  "taxonomy-community": "admin_menu_taxonomy_community",
  "taxonomy-delivery": "admin_menu_taxonomy_delivery",
  "delivery-banners": "admin_menu_domain_banners",
  "delivery-popups": "admin_menu_domain_popups",
  "delivery-ptr-ads": "admin_menu_domain_ptr_ads",
  "delivery-events": "admin_menu_domain_events",
  "trade-ad-placements": "admin_menu_domain_ad_placements",
  "trade-banners": "admin_menu_domain_banners",
  "trade-popups": "admin_menu_domain_popups",
  "trade-ptr-ads": "admin_menu_domain_ptr_ads",
  "trade-events": "admin_menu_domain_events",
  "community-ad-placements": "admin_menu_domain_ad_placements",
  "community-banners": "admin_menu_domain_banners",
  "community-popups": "admin_menu_domain_popups",
  "community-ptr-ads": "admin_menu_domain_ptr_ads",
  "community-events": "admin_menu_domain_events",
  "cp-support-appeals": "admin_menu_cp_support_appeals",
  "cp-support-store-inquiries": "admin_menu_cp_support_store_inquiries",

  // Members
  users: "admin_menu_users",
  "global-reports": "admin_menu_reports_observation",
  "audit-logs": "admin_menu_dev_audit",
  "push-devices": "admin_menu_push_devices",

  // Moderation
  "reports-posts": "admin_menu_trade_reports",
  "reports-logs": "admin_menu_reports_logs",
  "reviews-trade": "admin_menu_trade_reviews",
  "store-reports-admin": "admin_menu_store_reports",
  "store-reviews-admin": "admin_menu_store_reviews",
  "chat-reported": "admin_menu_chat_report_queue",
  "philife-meeting-reports": "admin_menu_meeting_reports",
  "manage-reports": "admin_menu_manage_reports",

  // Trade
  "trade-hub": "admin_menu_trade_hub",
  "trade-products": "admin_menu_trade_products",
  "posts-management": "admin_menu_posts_management",
  "jobs-management": "admin_menu_jobs_management",
  "trade-settings": "admin_menu_trade_settings",
  "trade-post-ads": "admin_menu_trade_post_ads",
  "trade-ad-policies": "admin_menu_trade_ad_policies",
  "menu-trade": "admin_menu_menu_trade",
  "trade-likes": "admin_menu_trade_likes",
  "chat-trade-flow": "admin_menu_chat_flow",
  "chat-trade-complete": "admin_menu_chat_trade_complete",

  // Community
  "community-hub": "admin_menu_community",
  "community-home": "admin_community_home_title",
  "community-boards": "admin_menu_boards",
  "community-sections": "admin_menu_feed_sections",
  "community-topics": "admin_menu_community_topics",
  "community-feed-settings": "admin_menu_feed_settings",
  "community-meeting-events": "admin_menu_meeting_logs",
  "community-meetings": "admin_menu_meetings",
  "community-posts": "admin_menu_community_posts",
  "community-external-import": "admin_menu_community_external_import",
  "community-comments": "admin_menu_community_comments",
  "community-feed-reports": "admin_menu_community_reports",
  "community-point-policies": "admin_menu_community_point_policies",
  "community-promotions": "admin_menu_community_promotions",
  "community-section-ops": "admin_menu_community_section_ops",
  "community-section-content": "admin_menu_community_section_content",
  "community-section-moderation": "admin_menu_community_section_moderation",
  "community-section-promo-point": "admin_menu_community_section_promo_point",
  "community-section-settings": "admin_menu_community_section_settings",
  "community-section-members": "admin_menu_community_section_members",
  "community-section-promotion": "admin_menu_community_section_promotion",
  "community-section-support": "admin_menu_community_section_support",
  "community-section-content-ops": "admin_menu_community_section_content_ops",
  "community-restrictions": "admin_menu_community_restrictions",
  "community-appeals": "admin_menu_community_appeals",
  "community-members": "admin_menu_community_members",
  "community-points": "admin_menu_community_points",
  "community-point-charges": "admin_menu_community_point_charges",
  "community-support": "admin_menu_community_support",
  "community-notices": "admin_menu_community_notices",
  "community-audit": "admin_menu_community_audit",
  "community-stats": "admin_menu_community_stats",

  // Delivery — section headers (path 없음) + leaves
  "delivery-section-policies": "admin_menu_delivery_section_policies",
  "delivery-section-settings": "admin_menu_delivery_section_settings",
  "delivery-section-operations": "admin_menu_delivery_section_operations",
  "delivery-section-management": "admin_menu_delivery_section_management",
  "delivery-section-platform": "admin_menu_delivery_section_platform",
  "delivery-section-stores": "admin_menu_delivery_section_stores",
  "delivery-section-field": "admin_menu_delivery_section_field",
  "delivery-section-fees": "admin_menu_delivery_section_fees",
  "delivery-section-promotions": "admin_menu_delivery_section_promotions",
  "delivery-section-records": "admin_menu_delivery_section_records",
  "delivery-screens": "admin_menu_delivery_screens",
  "delivery-menus": "admin_menu_delivery_menus",
  "delivery-section-home-layout": "admin_menu_delivery_section_home_layout",
  "stores-commerce": "admin_menu_store_review_queue",
  "store-discovery-control": "admin_menu_store_discovery_control",
  "store-insertions-control": "admin_menu_store_insertions_control",
  "store-ads-control": "admin_menu_store_ads_control",
  "delivery-ads-control": "admin_menu_delivery_ads_control",
  "ads-advertising-workspace": "admin_menu_ads_advertising_workspace",
  "delivery-ads-ops": "admin_menu_delivery_ads_ops",
  "delivery-ads-commercial": "admin_menu_delivery_ads_commercial",
  "store-banner-ads-control": "admin_menu_store_banner_ads_control",
  "store-ads-section": "admin_menu_store_ads_section",
  "store-coupons-control": "admin_menu_store_coupons_control",
  "store-coupon-control-center": "admin_menu_store_coupon_control_center",
  "gift-certificates": "admin_menu_gift_certificates",
  "store-promo-control": "admin_menu_store_promo_control",
  "stores-home-management": "admin_menu_stores_home_management",
  "stores-home-shelves": "admin_menu_stores_home_shelves",
  "stores-industries-management": "admin_menu_stores_industries_management",
  "stores-industry-primary": "admin_menu_stores_industry_primary",
  "stores-industry-secondary": "admin_menu_stores_industry_secondary",
  "stores-browse-policy": "admin_menu_stores_browse_policy",
  "stores-category-management": "admin_menu_stores_category_management",
  "stores-category-primary": "admin_menu_stores_category_primary",
  "stores-category-secondary": "admin_menu_stores_category_secondary",
  "stores-composition-policy": "admin_menu_stores_composition_policy",
  "store-settings-taxonomy": "admin_menu_store_settings_taxonomy",
  "store-settings-alerts": "admin_menu_store_settings_alerts",
  "delivery-bottom-nav": "admin_menu_delivery_bottom_nav",
  "store-products-admin": "admin_menu_store_products",
  "delivery-orders": "admin_menu_delivery_ops",
  "delivery-orders-list": "admin_menu_delivery_order_list",
  "delivery-orders-action-queue": "admin_menu_store_orders_action_queue",
  "delivery-orders-cancel": "admin_menu_delivery_cancel",
  "delivery-orders-refund": "admin_menu_delivery_refund",
  "delivery-orders-settlement": "admin_menu_delivery_settlement",
  "delivery-orders-reports": "admin_menu_delivery_reports",
  "delivery-orders-logs": "admin_menu_delivery_logs",
  "delivery-order-chats": "admin_menu_order_chats",
  "delivery-ops-console": "admin_menu_delivery_ops_console",
  "delivery-operations-stats": "admin_menu_delivery_operations_stats",
  "delivery-riders-ops": "admin_menu_delivery_riders_ops",
  "delivery-operation-alerts": "admin_menu_delivery_operation_alerts",
  "delivery-order-notifications": "admin_menu_order_notifications",
  "delivery-auto-actions": "admin_menu_delivery_auto_actions",
  "delivery-distance": "admin_menu_delivery_distance",
  "runtime-health": "admin_menu_runtime_health",
  "delivery-release-gate": "admin_menu_delivery_release_gate",
  "store-settlements-admin": "admin_menu_store_settlements",
  "store-fee-policies-admin": "admin_menu_store_fee_policies_admin",
  "store-payment-events-admin": "admin_menu_store_payment_events",
  "commerce-settings-admin": "admin_menu_commerce_settings",
  "delivery-dashboard": "admin_menu_delivery_dashboard",
  "business-shops": "admin_menu_business_management",
  "messenger-hub": "admin_menu_messenger_hub",

  // Messenger
  "chat-all": "admin_menu_chat_all",
  "chat-trade": "admin_menu_chat_trade",
  // J-AMD-4 (Owner O-C12): chat workspace sections — 채팅방 / 신고·제재 / 통화 기록 / 시스템.
  "chat-messenger": "admin_menu_chat_call_records",
  "chat-messenger-perf": "admin_menu_chat_messenger_performance",
  "messenger-section-rooms": "admin_menu_chat_section_rooms",
  "messenger-section-reports": "admin_menu_chat_section_reports",
  "messenger-section-calls": "admin_menu_chat_section_calls",
  "messenger-section-system": "admin_menu_chat_section_system",
  "chat-trade-messenger": "admin_menu_chat_rooms_trade",
  "delivery-order-chats-messenger": "admin_menu_chat_rooms_store_order",
  "chat-group": "admin_menu_chat_rooms_group",
  "chat-general": "admin_menu_chat_rooms_general",

  // Trade family extras (Cut B) · 거래 Admin 설계 v2 §B-2
  "trade-users": "admin_menu_trade_members",
  "trade-audit": "admin_menu_trade_audit",
  "trade-restrictions": "admin_menu_trade_restrictions",
  "trade-appeals": "admin_menu_trade_appeals",
  "trade-chat-reports": "admin_menu_trade_chat_reports",
  "trade-promotions": "admin_menu_trade_promotions",
  "trade-points": "admin_menu_trade_points",
  "trade-point-charges": "admin_menu_trade_point_charges",
  "trade-support": "admin_menu_trade_support",
  "trade-regions": "admin_menu_trade_regions",
  "trade-showcase": "admin_menu_trade_showcase",
  "trade-section-ops": "admin_menu_trade_section_ops",
  "trade-section-moderation": "admin_menu_trade_section_moderation",
  "trade-section-content": "admin_menu_trade_section_content",
  "trade-section-chat": "admin_menu_trade_section_chat",
  "trade-section-members": "admin_menu_trade_section_members",
  "trade-section-promotion": "admin_menu_trade_section_promotion",
  "trade-section-points": "admin_menu_trade_section_points",
  "trade-section-support": "admin_menu_trade_section_support",
  "trade-section-settings": "admin_menu_trade_section_settings",
  "trade-section-records": "admin_menu_trade_section_records",

  // Ads / Growth-rec
  "ads-applications": "admin_menu_ads_applications",
  "ads-paid": "admin_menu_ads_paid_legacy",
  "ads-feed": "admin_menu_ads_feed",
  "ads-feed-applications": "admin_menu_ads_feed_applications",
  "ads-feed-products": "admin_menu_ads_feed_products",
  "ads-legacy": "admin_menu_ads_legacy",
  "ads-products": "admin_menu_ads_products",
  "ads-post-ads": "admin_menu_ads_posts",
  "ads-benefits": "admin_menu_ads_benefits",
  "ads-policy": "admin_menu_ads_policy",
  "ads-home-feed": "admin_menu_ads_home_feed",
  "ads-recommendation": "admin_menu_ads_recommendation",
  "ads-banners": "admin_menu_ads_banners",
  "ads-platform-popup": "admin_menu_ads_platform_popup",
  "ads-platform-events": "admin_menu_ads_platform_events",
  "ads-event-owner-requests": "admin_menu_ads_event_owner_requests",
  "growth-rec": "admin_menu_growth_recommendation",
  "manage-ab": "admin_menu_manage_ab",
  "rec-analytics": "admin_menu_rec_analytics",
  "rec-monitoring": "admin_menu_rec_monitoring",
  "rec-deployments": "admin_menu_rec_deployments",
  "rec-automation": "admin_menu_rec_automation",

  // App Config
  "settings-general": "admin_menu_settings_general",
  "settings-startup-config": "admin_menu_settings_startup_config",
  "settings-startup": "admin_menu_settings_startup_group",
  "settings-os-start": "admin_menu_settings_os_start",
  "settings-intro": "admin_menu_settings_intro",
  "settings-auth": "admin_menu_settings_auth",
  "settings-notifications": "admin_menu_settings_notifications",
  "menu-main-bottom-nav": "admin_menu_main_bottom_nav",
  "app-categories": "admin_menu_categories",
  "app-countries": "admin_menu_app_countries",
  "app-languages": "admin_menu_app_languages",
  "app-meta": "admin_menu_app_meta",
  "my-banners": "admin_menu_my_banners",
  "my-sections": "admin_menu_my_sections",
  "my-services": "admin_menu_my_services",

  // Platform Ops
  manage: "admin_menu_manage",
  "manage-experiments": "admin_menu_manage_experiments",
  "manage-ops-board": "admin_menu_manage_ops_board",
  "manage-knowledge": "admin_menu_manage_knowledge",
  "manage-docs": "admin_menu_manage_docs",
  "manage-runbooks": "admin_menu_manage_runbooks",
  "manage-kb": "admin_menu_manage_kb",
  "manage-kg": "admin_menu_manage_kg",
  "manage-eval": "admin_menu_manage_eval",
  "manage-learning": "admin_menu_manage_learning",
  "manage-maturity": "admin_menu_manage_maturity",
  "manage-benchmarks": "admin_menu_manage_benchmarks",
  "platform-system": "admin_menu_dev",
  "system-qa": "admin_menu_dev_qa",
  "system-hotfix": "admin_menu_dev_hotfix",
  "system-longrun": "admin_menu_dev_longterm",
  "system-backlog": "admin_menu_dev_backlog",
  "system-sprint": "admin_menu_dev_sprints",
  "system-release": "admin_menu_dev_release",
  "system-release-notes": "admin_menu_dev_release_notes",
  "system-release-archive": "admin_menu_dev_release_archive",
  "system-release-migration": "admin_menu_dev_production",
  "system-manage": "admin_menu_dev_system",
  "system-backup": "admin_menu_dev_backup",
  "system-prelaunch-reset": "admin_menu_data_reset",
  "system-deploy": "admin_menu_system_deploy",
  "system-dr": "admin_menu_dev_dr",
  "system-security": "admin_menu_dev_security",
  "system-performance": "admin_menu_dev_performance",
  "system-usage": "admin_menu_dev_usage",
  "system-automation": "admin_menu_dev_automation",
  "system-status": "admin_menu_dev_system_status",
  "system-audit": "admin_menu_dev_audit",
  "ops-launch-readiness": "admin_menu_launch_readiness",
  "ops-launch-week": "admin_menu_launch_week",
  "ops-docs-board": "admin_menu_docs_board",
  "ops-docs-chat": "admin_menu_docs_chat",
  "ops-memo": "admin_menu_memo",
};

function resolveAdminMenuTitleKey(itemKey: string): MessageKey | undefined {
  return (
    ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY[itemKey] ??
    (`admin_menu_${itemKey.replace(/-/g, "_")}` as MessageKey)
  );
}

function attachAdminMenuTitleKeys(items: AdminMenuItem[]): AdminMenuItem[] {
  return items.map((item) => ({
    ...item,
    titleKey: item.titleKey ?? resolveAdminMenuTitleKey(item.key),
    children: item.children?.length ? attachAdminMenuTitleKeys(item.children) : undefined,
  }));
}

/**
 * CUT J workspace SSOT
 * DASHBOARD / MEMBERS / DELIVERY / TRADE / COMMUNITY / MESSENGER /
 * FINANCE / ADS / PROMOTION / SUPPORT / NOTIFICATIONS / SYSTEM
 * (J-AMD-1: members immediately after dashboard)
 */
export const adminMenu: AdminMenuItem[] = attachAdminMenuTitleKeys([
  // ── DASHBOARD ──────────────────────────────────
  {
    key: "dashboard",
    title: "",
    path: "/admin",
    status: "done",
  },

  // ── MEMBERS (J-AMD-1 · J-AMD-5) ────────────────
  {
    key: "members",
    title: "",
    status: "done",
    // Admin IA R1: 회원 / 신고·제재 / 관리자 섹션 (leaf key·경로 불변)
    children: [
      {
        key: "members-section-accounts",
        title: "",
        status: "done",
        children: [
          { key: "users", title: "", path: "/admin/users", status: "done" },
          // J-AMD-5: existing member sub-screens exposed as leaves (pages already exist).
          {
            key: "users-phone-verification",
            title: "",
            path: "/admin/users/phone-verification",
            status: "done",
          },
          {
            key: "users-deletion-requests",
            title: "",
            path: "/admin/users/deletion-requests",
            status: "done",
          },
          // Admin IA R1 (J-6): 메뉴 밖이던 회원 혜택 — 고객 마이페이지 혜택(`/api/me/benefits`)이 읽는 실사용 화면
          {
            key: "member-benefits",
            title: "",
            path: "/admin/member-benefits",
            matchPaths: ["/admin/member-benefits/"],
            status: "done",
          },
        ],
      },
      {
        key: "members-section-moderation",
        title: "",
        status: "done",
        children: [
          { key: "global-reports", title: "", path: "/admin/reports", status: "done" },
          { key: "reports-logs", title: "", path: "/admin/reports/log", status: "done" },
          // 재감사 G-09: 리뷰·후기 중앙 진입 (원래 메뉴: 배달 › 매장 리뷰, 거래 › 거래 후기)
          { key: "members-reviews-store", title: "", path: "/admin/store-reviews", entryAlias: true, status: "done" },
          { key: "members-reviews-trade", title: "", path: "/admin/reviews", entryAlias: true, status: "done" },
        ],
      },
      {
        key: "members-section-admins",
        title: "",
        status: "done",
        children: [
          { key: "audit-logs", title: "", path: "/admin/audit-logs", status: "done" },
          // J-AMD-5 (F3): 관리자 계정·권한 — 조회·변경 API 가 requireSuperAdmin 이라 최고관리자 전용.
          { key: "admin-staff", title: "", path: "/admin/staff", status: "done", roles: ["master"] },
        ],
      },
    ],
  },

  // ── DELIVERY ───────────────────────────────────
  // J-AMD-3 (Owner-approved A-1): operator-task sections —
  // 매장 → 주문 → 배달 현장 → 수수료·정산 → 혜택·프로모션 → 매장 홈 화면 구성 → 배달 설정.
  // Developer tools (runtime-health · delivery-release-gate) live under system (J-AMD-5: flat, master-only).
  // Global pending-work queue (delivery-order-notifications) lives under support.
  // delivery-ads primary ownership remains ads workspace (B5).
  {
    key: "delivery",
    title: "",
    children: [
      { key: "delivery-dashboard", title: "", path: "/admin/delivery", status: "done" },
      {
        key: "delivery-section-stores",
        title: "",
        status: "done",
        children: [
          { key: "stores-commerce", title: "", path: "/admin/stores", status: "done" },
          { key: "business-shops", title: "", path: "/admin/business", status: "done" },
          {
            key: "store-products-admin",
            title: "",
            path: "/admin/store-products",
            status: "partial",
          },
          {
            key: "store-inquiries-admin",
            title: "",
            path: "/admin/store-inquiries",
            status: "done",
          },
          {
            key: "store-reports-admin",
            title: "",
            path: "/admin/store-reports",
            status: "partial",
          },
          {
            key: "store-reviews-admin",
            title: "",
            path: "/admin/store-reviews",
            status: "partial",
          },
        ],
      },
      {
        key: "delivery-orders",
        title: "",
        status: "done",
        children: [
          {
            key: "delivery-orders-list",
            title: "",
            path: "/admin/stores/orders",
            matchPaths: ["/admin/delivery-orders"],
            status: "done",
          },
          {
            key: "delivery-orders-action-queue",
            title: "",
            path: "/admin/store-orders",
            status: "partial",
          },
          {
            key: "delivery-orders-cancel",
            title: "",
            path: "/admin/stores/orders/cancellations",
            status: "done",
          },
          {
            key: "delivery-orders-refund",
            title: "",
            path: "/admin/stores/orders/refunds",
            status: "done",
          },
          {
            key: "delivery-orders-logs",
            title: "",
            path: "/admin/stores/orders/logs",
            status: "done",
          },
          {
            key: "delivery-order-chats",
            title: "",
            path: "/admin/order-chats",
            matchPaths: ["/admin/chats/business"],
            status: "done",
          },
        ],
      },
      {
        key: "delivery-section-field",
        title: "",
        status: "done",
        children: [
          { key: "delivery-ops-console", title: "", path: "/admin/ops-console", status: "done" },
          {
            key: "delivery-operations-stats",
            title: "",
            path: "/admin/delivery-operations",
            status: "done",
          },
          { key: "delivery-riders-ops", title: "", path: "/admin/delivery-riders", status: "done" },
          {
            key: "delivery-operation-alerts",
            title: "",
            path: "/admin/delivery-alerts",
            status: "done",
          },
          {
            key: "delivery-auto-actions",
            title: "",
            path: "/admin/delivery-auto-actions",
            status: "done",
          },
        ],
      },
      {
        key: "delivery-section-fees",
        title: "",
        status: "done",
        children: [
          {
            key: "store-fee-policies-admin",
            title: "",
            path: "/admin/store-fee-policies",
            status: "done",
          },
          {
            key: "store-settlements-admin",
            title: "",
            path: "/admin/store-settlements",
            status: "partial",
          },
        ],
      },
      {
        key: "delivery-section-promotions",
        title: "",
        status: "done",
        children: [
          {
            key: "store-coupon-control-center",
            title: "",
            path: "/admin/store-coupon-control",
            status: "done",
          },
          {
            key: "gift-certificates",
            title: "",
            path: "/admin/gift-certificates",
            status: "done",
          },
          {
            key: "store-promo-control",
            title: "",
            path: "/admin/store-discovery",
            status: "done",
          },
          // 재감사 G-06 (Owner 승인 2026-10-30): 배달 광고·배너·팝업 — 공통 화면을 `?domain=delivery` 로 걸러 연다 (원장·화면 하나)
          { key: "delivery-ads-entry", title: "", path: "/admin/advertising/placements?domain=delivery", entryAlias: true, status: "done" },
          { key: "delivery-banners", title: "", path: "/admin/advertising/banners?domain=delivery", entryAlias: true, status: "done" },
          { key: "delivery-popups", title: "", path: "/admin/platform-popup?domain=delivery", entryAlias: true, status: "done" },
          { key: "delivery-ptr-ads", title: "", path: "/admin/ptr-reveal-ads?domain=delivery", entryAlias: true, status: "done" },
          { key: "delivery-events", title: "", path: "/admin/platform-events?domain=delivery", entryAlias: true, status: "done" },
        ],
      },
      {
        key: "delivery-section-home-layout",
        title: "",
        status: "done",
        children: [
          {
            key: "delivery-screens",
            title: "",
            path: "/admin/delivery-screens",
            /** 흡수된 옛 화면에서도 사이드바는 이 메뉴를 강조 */
            matchPaths: [
              "/admin/stores-home-shelves",
              "/admin/stores-category-policy",
              "/admin/stores/application-settings?menu=stores",
            ],
            status: "done",
          },
          /** 배민 미러링 — 고객 메뉴(상단 탭·아이콘·매장 지정)는 「배달 화면 구성」과 분리된 단독 화면 */
          {
            key: "delivery-menus",
            title: "",
            path: "/admin/delivery-menus",
            status: "done",
          },
          {
            key: "stores-home-shelves",
            title: "",
            /** 5-G — 「배달 화면 구성」 탭으로 흡수. URL·키 유지, 사이드바에서만 숨김 */
            sidebarPublic: false,
            path: "/admin/stores-home-shelves",
            status: "done",
          },
          {
            key: "stores-industries-management",
            title: "",
            /** 5-G — 「배달 화면 구성」 탭으로 흡수. URL·키 유지, 사이드바에서만 숨김 */
            sidebarPublic: false,
            status: "done",
            children: [
              {
                key: "stores-industry-primary",
                title: "",
                path: "/admin/stores/application-settings?menu=stores&focus=category",
                status: "done",
              },
              {
                key: "stores-industry-secondary",
                title: "",
                path: "/admin/stores/application-settings?menu=stores&focus=topic",
                status: "done",
              },
            ],
          },
          {
            key: "stores-browse-policy",
            title: "",
            /** 5-G — 「배달 화면 구성」 탭으로 흡수. URL·키 유지, 사이드바에서만 숨김 */
            sidebarPublic: false,
            path: "/admin/stores-category-policy",
            matchPaths: [
              "/admin/stores-category-policy?tier=primary",
              "/admin/stores-category-policy?tier=secondary",
            ],
            status: "done",
          },
          {
            key: "delivery-bottom-nav",
            title: "",
            path: "/admin/stores/bottom-nav",
            matchPaths: ["/admin/delivery/bottom-nav"],
            status: "done",
          },
        ],
      },
      {
        key: "delivery-section-records",
        title: "",
        status: "done",
        children: [
          {
            key: "store-payment-events-admin",
            title: "",
            path: "/admin/store-payment-events",
            status: "partial",
          },
        ],
      },
      {
        key: "delivery-section-settings",
        title: "",
        status: "done",
        children: [
          { key: "delivery-distance", title: "", path: "/admin/delivery-distance", status: "done" },
          {
            key: "store-settings-alerts",
            title: "",
            path: "/admin/stores/application-settings?menu=alerts",
            matchPaths: ["/admin/stores/application-settings"],
            status: "done",
          },
          {
            key: "commerce-settings-admin",
            title: "",
            path: "/admin/commerce-settings",
            status: "partial",
          },
        ],
      },
    ],
  },

  // ── TRADE ──────────────────────────────────────
  // 거래 Admin 설계 v2 §B-2 (Owner 승인): 10 그룹 · 19 메뉴 — 운영 현황 → 신고·제재 → 게시물 → 거래 채팅 → 회원 →
  // 홍보 → 포인트·충전 → 문의 → 운영 설정 → 기록. 기존 URL 유지, 예전 경로는 matchPaths 로 같은 메뉴를 강조한다.
  {
    key: "trade",
    title: "",
    children: [
      {
        key: "trade-section-ops",
        title: "",
        status: "done",
        children: [{ key: "trade-hub", title: "", path: "/admin/trade", status: "done" }],
      },
      {
        key: "trade-section-moderation",
        title: "",
        status: "done",
        children: [
          {
            key: "reports-posts",
            title: "",
            path: "/admin/trade/reports",
            matchPaths: ["/admin/reports?domain=trade"],
            status: "done",
          },
          { key: "trade-restrictions", title: "", path: "/admin/trade/restrictions", status: "done" },
          { key: "trade-appeals", title: "", path: "/admin/trade/support?type=appeal", status: "done" },
        ],
      },
      {
        key: "trade-section-content",
        title: "",
        status: "done",
        children: [
          {
            key: "posts-management",
            title: "",
            path: "/admin/posts-management",
            matchPaths: ["/admin/products"],
            status: "done",
          },
          { key: "reviews-trade", title: "", path: "/admin/reviews", status: "done" },
        ],
      },
      {
        key: "trade-section-chat",
        title: "",
        status: "done",
        children: [
          {
            key: "chat-trade",
            title: "",
            path: "/admin/chats/trade",
            status: "done",
          },
          {
            key: "chat-trade-flow",
            title: "",
            path: "/admin/trade-flow",
            matchPaths: ["/admin/chats/trade-complete", "/admin/trade-flow?panel=complete"],
            status: "done",
          },
          { key: "trade-chat-reports", title: "", path: "/admin/chats/reported?domain=trade", status: "done" },
        ],
      },
      {
        key: "trade-section-members",
        title: "",
        status: "done",
        children: [
          {
            key: "trade-users",
            title: "",
            path: "/admin/trade/members",
            matchPaths: ["/admin/users?from=trade"],
            status: "done",
          },
        ],
      },
      {
        key: "trade-section-promotion",
        title: "",
        status: "done",
        children: [
          {
            key: "trade-promotions",
            title: "",
            path: "/admin/trade/promotions",
            matchPaths: ["/admin/trade-post-ads"],
            status: "done",
          },
          { key: "trade-ad-policies", title: "", path: "/admin/trade-ad-policies", status: "done" },
          // 재감사 G-06: 거래 광고 위치·배너·팝업 (공통 화면 `?domain=trade`)
          { key: "trade-ad-placements", title: "", path: "/admin/advertising/placements?domain=trade", entryAlias: true, status: "done" },
          { key: "trade-banners", title: "", path: "/admin/advertising/banners?domain=trade", entryAlias: true, status: "done" },
          { key: "trade-popups", title: "", path: "/admin/platform-popup?domain=trade", entryAlias: true, status: "done" },
          { key: "trade-ptr-ads", title: "", path: "/admin/ptr-reveal-ads?domain=trade", entryAlias: true, status: "done" },
          { key: "trade-events", title: "", path: "/admin/platform-events?domain=trade", entryAlias: true, status: "done" },
        ],
      },
      {
        key: "trade-section-points",
        title: "",
        status: "done",
        children: [
          { key: "trade-points", title: "", path: "/admin/trade/points", status: "done" },
          { key: "trade-point-charges", title: "", path: "/admin/trade/point-charges", status: "done" },
        ],
      },
      {
        key: "trade-section-support",
        title: "",
        status: "done",
        children: [{ key: "trade-support", title: "", path: "/admin/trade/support", status: "done" }],
      },
      {
        key: "trade-section-settings",
        title: "",
        status: "done",
        children: [
          {
            key: "menu-trade",
            title: "",
            path: "/admin/menus/trade",
            matchPaths: ["/admin/categories"],
            status: "done",
          },
          { key: "trade-settings", title: "", path: "/admin/trade/settings", status: "done" },
          { key: "trade-regions", title: "", path: "/admin/trade/regions", status: "done" },
          { key: "trade-showcase", title: "", path: "/admin/trade/showcase", status: "done" },
        ],
      },
      {
        key: "trade-section-records",
        title: "",
        status: "done",
        children: [
          {
            key: "trade-audit",
            title: "",
            path: "/admin/trade/audit",
            matchPaths: ["/admin/favorites", "/admin/audit-logs?target_type=post"],
            status: "done",
          },
        ],
      },
    ],
  },

  // ── COMMUNITY ──────────────────────────────────
  // 커뮤니티 Admin 설계 v2 §B-2 (Owner 승인): 9 그룹 · 22 메뉴 — 운영 현황 → 신고·제재 → 게시물·댓글 →
  // 회원·작성자 → 홍보 → 포인트·충전 → 문의 → 콘텐츠 운영 → 운영 기록·설정. 기존 URL·별칭(/admin/philife/*) 유지.
  {
    key: "community",
    title: "",
    children: [
      {
        key: "community-section-ops",
        title: "",
        status: "done",
        children: [
          { key: "community-home", title: "", path: "/admin/community", status: "done" },
        ],
      },
      {
        key: "community-section-moderation",
        title: "",
        status: "done",
        children: [
          {
            key: "community-feed-reports",
            title: "",
            path: "/admin/community/reports",
            matchPaths: ["/admin/philife/reports"],
            status: "done",
          },
          {
            key: "philife-meeting-reports",
            title: "",
            path: "/admin/philife/meeting-reports",
            status: "done",
          },
          {
            key: "community-restrictions",
            title: "",
            path: "/admin/community/restrictions",
            status: "done",
          },
          {
            key: "community-appeals",
            title: "",
            path: "/admin/community/support?type=appeal",
            status: "done",
          },
        ],
      },
      {
        key: "community-section-content",
        title: "",
        status: "done",
        children: [
          { key: "community-posts", title: "", path: "/admin/community/posts", status: "done" },
          {
            key: "community-comments",
            title: "",
            path: "/admin/community/comments",
            status: "done",
          },
          {
            key: "community-meetings",
            title: "",
            path: "/admin/community/meetings",
            matchPaths: ["/admin/philife/meetings"],
            status: "done",
          },
        ],
      },
      {
        key: "community-section-members",
        title: "",
        status: "done",
        children: [
          {
            key: "community-members",
            title: "",
            path: "/admin/community/members",
            status: "done",
          },
        ],
      },
      {
        key: "community-section-promotion",
        title: "",
        status: "done",
        children: [
          {
            key: "community-promotions",
            title: "",
            path: "/admin/community/promotions",
            status: "done",
          },
          // 재감사 G-06: 커뮤니티 광고 위치·배너·팝업 (공통 화면 `?domain=community`)
          { key: "community-ad-placements", title: "", path: "/admin/advertising/placements?domain=community", entryAlias: true, status: "done" },
          { key: "community-banners", title: "", path: "/admin/advertising/banners?domain=community", entryAlias: true, status: "done" },
          { key: "community-popups", title: "", path: "/admin/platform-popup?domain=community", entryAlias: true, status: "done" },
          { key: "community-ptr-ads", title: "", path: "/admin/ptr-reveal-ads?domain=community", entryAlias: true, status: "done" },
          { key: "community-events", title: "", path: "/admin/platform-events?domain=community", entryAlias: true, status: "done" },
        ],
      },
      {
        key: "community-section-promo-point",
        title: "",
        status: "done",
        children: [
          {
            key: "community-points",
            title: "",
            path: "/admin/community/points",
            status: "done",
          },
          {
            key: "community-point-charges",
            title: "",
            path: "/admin/community/point-charges",
            status: "done",
          },
          {
            key: "community-point-policies",
            title: "",
            path: "/admin/community/point-policies",
            status: "done",
          },
        ],
      },
      {
        key: "community-section-support",
        title: "",
        status: "done",
        children: [
          {
            key: "community-support",
            title: "",
            path: "/admin/community/support",
            status: "done",
          },
        ],
      },
      {
        key: "community-section-content-ops",
        title: "",
        status: "done",
        children: [
          {
            key: "community-topics",
            title: "",
            path: "/admin/community/topics",
            matchPaths: ["/admin/philife/topics"],
            status: "done",
          },
          {
            key: "community-sections",
            title: "",
            path: "/admin/community/sections",
            matchPaths: ["/admin/philife/sections"],
            status: "done",
          },
          {
            key: "community-external-import",
            title: "",
            path: "/admin/community/external-import",
            status: "done",
          },
          {
            key: "community-notices",
            title: "",
            path: "/admin/community/notices",
            status: "done",
          },
        ],
      },
      {
        key: "community-section-settings",
        title: "",
        status: "done",
        children: [
          {
            key: "community-audit",
            title: "",
            path: "/admin/community/audit",
            status: "done",
          },
          {
            key: "community-meeting-events",
            title: "",
            path: "/admin/philife/meeting-events",
            status: "done",
          },
          {
            key: "community-stats",
            title: "",
            path: "/admin/community/stats",
            status: "done",
          },
          {
            key: "community-feed-settings",
            title: "",
            path: "/admin/community/settings",
            matchPaths: ["/admin/philife/settings"],
            status: "done",
          },
        ],
      },
    ],
  },

  // ── MESSENGER ──────────────────────────────────
  // J-AMD-4 (Owner-approved O-C12) + 채팅 Admin 설계 v2 §1-3: 긴급도 순 —
  // 채팅 대시보드 · 신고·제재 · 통화 · 채팅방(전체·거래·배달 주문·일반·그룹) · 시스템.
  // 거래·배달 주문은 전체채팅의 유형 필터 (같은 CM 목록). 방 상세·레거시 거래 기록은 메뉴 없음.
  {
    key: "messenger",
    title: "",
    children: [
      { key: "messenger-hub", title: "", path: "/admin/messenger", status: "done" },
      {
        key: "messenger-section-reports",
        title: "",
        children: [
          { key: "chat-reported", title: "", path: "/admin/chats/reported", status: "done" },
        ],
      },
      {
        key: "messenger-section-calls",
        title: "",
        children: [
          {
            key: "chat-messenger",
            title: "",
            path: "/admin/chats/calls",
            matchPaths: ["/admin/chats/calls/analysis"],
            status: "done",
          },
        ],
      },
      {
        key: "messenger-section-rooms",
        title: "",
        children: [
          // 방 상세 `/admin/chats/messenger/[id]` 는 `/admin/chats` 접두로 「전체」에 잡힌다.
          { key: "chat-all", title: "", path: "/admin/chats", status: "done" },
          {
            key: "chat-trade-messenger",
            title: "",
            path: "/admin/chats?type=trade",
            // 예전 북마크 `?from=messenger` 호환 (CUT J 하드락) + 레거시 거래 기록.
            matchPaths: ["/admin/chats/trade?from=messenger", "/admin/chats/trade-legacy"],
            status: "done",
          },
          {
            key: "delivery-order-chats-messenger",
            title: "",
            path: "/admin/chats?type=store_order",
            matchPaths: ["/admin/order-chats?from=messenger"],
            status: "done",
          },
          {
            key: "chat-general",
            title: "",
            path: "/admin/chats/general",
            matchPaths: ["/admin/chats/community"],
            status: "done",
          },
          { key: "chat-group", title: "", path: "/admin/chats/group", status: "done" },
        ],
      },
      {
        key: "messenger-section-system",
        title: "",
        children: [
          {
            key: "chat-messenger-perf",
            title: "",
            path: "/admin/chats/messenger-performance",
            status: "done",
          },
          // J-AMD-4: moved from system › ops (same key / path).
          { key: "ops-docs-chat", title: "", path: "/admin/docs/chat", status: "done" },
        ],
      },
    ],
  },

  // ── FINANCE ────────────────────────────────────
  // B7: B4 Control Plane root first → Point specialists → Store Coin ledger.
  // B3 Statement stays contextual (storeId query), not a primary sidebar leaf.
  {
    key: "finance",
    title: "",
    children: [
      {
        key: "store-finance-admin",
        title: "",
        path: "/admin/finance",
        status: "done",
      },
      {
        key: "finance-member-point",
        title: "",
        status: "done",
        children: [
          { key: "points-charge", title: "", path: "/admin/point-charges", status: "done" },
          { key: "points-ledger", title: "", path: "/admin/points/ledger", status: "done" },
          { key: "points-plans", title: "", path: "/admin/point-plans", status: "done" },
          { key: "points-policy", title: "", path: "/admin/point-policies", status: "done" },
          { key: "points-execute", title: "", path: "/admin/point-executions", status: "done" },
          { key: "points-expire", title: "", path: "/admin/points/expire", status: "done" },
        ],
      },
      {
        key: "finance-store-currency",
        title: "",
        status: "done",
        children: [
          {
            key: "finance-transactions",
            title: "",
            path: "/admin/finance/transactions",
            status: "done",
          },
          {
            key: "finance-stores",
            title: "",
            path: "/admin/finance/stores",
            status: "done",
          },
          {
            key: "finance-orders",
            title: "",
            path: "/admin/finance/orders",
            status: "done",
          },
          {
            key: "store-point-ledger-admin",
            title: "",
            path: "/admin/finance/transactions?wallet=COIN",
            // Legacy AST-002 path still redirects here — keep finance workspace match.
            matchPaths: ["/admin/store-point-ledger"],
            status: "done",
          },
          {
            key: "finance-cash",
            title: "",
            path: "/admin/finance/transactions?wallet=CASH",
            status: "done",
          },
          {
            key: "finance-outstanding",
            title: "",
            path: "/admin/finance/outstanding",
            status: "done",
          },
          {
            key: "finance-ads",
            title: "",
            path: "/admin/finance/ads",
            status: "done",
          },
          {
            key: "finance-withdrawals",
            title: "",
            path: "/admin/finance/withdrawals",
            status: "done",
          },
          {
            key: "finance-settings",
            title: "",
            path: "/admin/finance/settings",
            status: "done",
          },
        ],
      },
    ],
  },

  // ── ADS — Owner Policy LOCK: lifecycle IA only (7 PUBLIC leaves) ──
  {
    key: "ads",
    title: "",
    children: [
      // 재감사 (Owner 승인 2026-10-30): 광고·배너 = 광고·프로모션 통합 관리. 「광고 운영」 7개는 원래 화면(key·경로 불변).
      // 아래 섹션의 entryAlias 항목은 다른 워크스페이스에 원래 메뉴가 있는 같은 화면 — 원장·URL 하나, 들어온 워크스페이스 유지.
      {
        key: "ads-section-operations",
        title: "",
        status: "done",
        children: [
          {
            key: "ads-advertising-workspace",
            title: "",
            path: "/admin/advertising",
            status: "done",
          },
          {
            key: "ads-authority-boosts",
            title: "",
            path: "/admin/advertising/boosts",
            status: "done",
          },
          {
            key: "ads-authority-applications",
            title: "",
            path: "/admin/advertising/applications",
            status: "done",
          },
          {
            key: "ads-authority-operations",
            title: "",
            path: "/admin/advertising/operations",
            status: "done",
          },
          {
            key: "ads-authority-placements",
            title: "",
            path: "/admin/advertising/placements",
            matchPaths: ["/admin/delivery-ads/inventory"],
            status: "done",
          },
          {
            key: "ads-authority-products",
            title: "",
            path: "/admin/advertising/products",
            matchPaths: [
              "/admin/feed-ad-products",
              "/admin/delivery-ads/commercial-settings",
            ],
            status: "done",
          },
          {
            key: "ads-authority-history",
            title: "",
            path: "/admin/advertising/history",
            matchPaths: ["/admin/promoted-items"],
            status: "done",
          },
        ],
      },
      {
        key: "ads-section-banners",
        title: "",
        status: "done",
        children: [
          {
            key: "ads-banners-overview",
            title: "",
            path: "/admin/advertising/banners",
            status: "done",
          },
          {
            key: "ads-banners-promotion",
            title: "",
            path: "/admin/platform-promotion/banners",
            entryAlias: true,
            status: "done",
          },
          {
            key: "ads-banners-mypage",
            title: "",
            path: "/admin/my/banners",
            entryAlias: true,
            status: "done",
          },
        ],
      },
      {
        key: "ads-section-popups",
        title: "",
        status: "done",
        children: [
          {
            key: "ads-popups-popup",
            title: "",
            path: "/admin/platform-popup",
            entryAlias: true,
            matchPaths: ["/admin/platform-popup/"],
            status: "done",
          },
          {
            key: "ads-popups-ptr",
            title: "",
            path: "/admin/ptr-reveal-ads",
            entryAlias: true,
            matchPaths: ["/admin/ptr-reveal-ads/"],
            status: "done",
          },
        ],
      },
      {
        key: "ads-section-promotions",
        title: "",
        status: "done",
        children: [
          {
            key: "ads-promo-events",
            title: "",
            path: "/admin/platform-events",
            entryAlias: true,
            matchPaths: ["/admin/platform-events/", "/admin/platform-events/new"],
            status: "done",
          },
          {
            key: "ads-promo-owner-requests",
            title: "",
            path: "/admin/platform-event-owner-requests",
            entryAlias: true,
            matchPaths: ["/admin/platform-event-owner-requests/"],
            status: "done",
          },
          {
            key: "ads-promo-coupons",
            title: "",
            path: "/admin/store-coupon-control",
            entryAlias: true,
            status: "done",
          },
          {
            key: "ads-promo-gift",
            title: "",
            path: "/admin/gift-certificates",
            entryAlias: true,
            status: "done",
          },
          {
            key: "ads-promo-discovery",
            title: "",
            path: "/admin/store-discovery",
            entryAlias: true,
            status: "done",
          },
        ],
      },
      {
        key: "ads-section-startup",
        title: "",
        status: "done",
        children: [
          {
            key: "ads-startup-os",
            title: "",
            path: "/admin/platform-promotion/os-start",
            entryAlias: true,
            status: "done",
          },
          {
            key: "ads-startup-intro",
            title: "",
            path: "/admin/platform-promotion/intro",
            entryAlias: true,
            status: "done",
          },
          {
            key: "ads-startup-config",
            title: "",
            path: "/admin/settings/startup-config",
            entryAlias: true,
            status: "done",
          },
        ],
      },
      // 알림 발송 v3 (Owner 승인 2026-10-30): 「홍보 발송」 바로가기 삭제 — 알림 보내기는 알림 › 푸시·알림 발송 한 곳.
      // Absorb-before-delete: keep keys for redirects/breadcrumb; not primary IA.
      {
        key: "ads-legacy",
        title: "",
        status: "partial",
        /** PUBLIC sidebar RETIRED — deep-links + redirects KEEP */
        sidebarPublic: false,
        children: [
          {
            key: "delivery-ads-control",
            title: "",
            path: "/admin/delivery-ads",
            exactPath: true,
            status: "partial",
          },
          {
            key: "ads-feed-applications",
            title: "",
            path: "/admin/ad-applications?domain=feed",
            status: "partial",
          },
          {
            key: "ads-applications",
            title: "",
            path: "/admin/ad-applications?domain=trade",
            status: "partial",
          },
          {
            key: "ads-community-promote",
            title: "",
            path: "/admin/ad-applications?domain=community",
            status: "partial",
          },
          {
            key: "delivery-ads-ops",
            title: "",
            path: "/admin/delivery-ads/manage",
            matchPaths: ["/admin/delivery-ads/manage"],
            matchPathPrefixes: ["/admin/delivery-ads"],
            status: "partial",
          },
          { key: "ads-feed", title: "", path: "/admin/feed-ads", status: "partial" },
          // Platform Promotion leaves moved to `promotion` workspace (CUT 3).
          // Keys KEEP for findAdminMenuByKey / redirects; paths removed so Ads does not steal IA.
          { key: "ads-platform-popup", title: "", status: "partial", sidebarPublic: false },
          { key: "ads-platform-events", title: "", status: "partial", sidebarPublic: false },
          { key: "ads-event-owner-requests", title: "", status: "partial", sidebarPublic: false },
          {
            key: "ads-placement-map",
            title: "",
            path: "/admin/delivery-ads/inventory#placement-map",
            matchPaths: ["/admin/delivery-ads/inventory"],
            status: "partial",
          },
          {
            key: "ads-feed-products",
            title: "",
            path: "/admin/feed-ad-products",
            status: "partial",
          },
          {
            key: "delivery-ads-commercial",
            title: "",
            path: "/admin/delivery-ads/commercial-settings",
            status: "partial",
          },
          {
            key: "ads-paid",
            title: "",
            path: "/admin/promoted-items",
            status: "partial",
          },
        ],
      },
    ],
  },

  // ── PROMOTION / EVENT — 「플랫폼 운영」 Platform Promotion (NOT paid Ads) ──
  // J-AMD-5 (Owner O-2): top leaves unchanged; 앱 화면 구성 · 추천 · 공통 콘텐츠 sections moved
  // from system (same keys / paths). 「알림」 link-hub leaf removed — URL kept as matchPaths of
  // notifications › cp-notification-engine.
  {
    key: "promotion",
    title: "",
    children: [
      {
        key: "promotion-home",
        title: "",
        path: "/admin/platform-promotion",
        exactPath: true,
        status: "done",
      },
      // Admin IA R1: 「프로모션」 섹션 (leaf key·경로 불변)
      {
        key: "promotion-section-campaigns",
        title: "",
        status: "done",
        children: [
          {
            key: "promotion-events",
            title: "",
            path: "/admin/platform-events",
            matchPaths: ["/admin/platform-events/", "/admin/platform-events/new"],
            status: "done",
          },
          {
            key: "promotion-popup",
            title: "",
            path: "/admin/platform-popup",
            matchPaths: [
              "/admin/platform-popup/",
              "/admin/platform-popup/requests",
              "/admin/platform-popup/requests/",
            ],
            status: "done",
          },
          {
            // 당겨서 새로고침 띠 광고 — Platform Popup 승인·기간·이벤트 재사용, 팝업 목록과 분리(ptr_reveal 만)
            key: "promotion-ptr-ads",
            title: "",
            path: "/admin/ptr-reveal-ads",
            matchPaths: ["/admin/ptr-reveal-ads/"],
            status: "done",
          },
          {
            key: "promotion-banners",
            title: "",
            path: "/admin/platform-promotion/banners",
            status: "done",
          },
          {
            key: "promotion-owner-requests",
            title: "",
            path: "/admin/platform-event-owner-requests",
            matchPaths: ["/admin/platform-event-owner-requests/"],
            status: "done",
          },
        ],
      },
      {
        // J-AMD-5 「앱 화면 구성」 (section key reused from the former 시작 화면 group)
        key: "settings-startup",
        title: "",
        children: [
          {
            key: "settings-os-start",
            title: "",
            path: "/admin/platform-promotion/os-start",
            status: "done",
          },
          {
            key: "settings-intro",
            title: "",
            path: "/admin/platform-promotion/intro",
            status: "done",
          },
          {
            key: "settings-startup-config",
            title: "",
            path: "/admin/settings/startup-config",
            status: "done",
          },
          {
            key: "menu-main-bottom-nav",
            title: "",
            path: "/admin/menus/main-bottom-nav",
            status: "done",
          },
          { key: "my-banners", title: "", path: "/admin/my/banners", status: "done" },
          { key: "my-sections", title: "", path: "/admin/my/sections", status: "done" },
          { key: "my-services", title: "", path: "/admin/my/services", status: "done" },
        ],
      },
      {
        // J-AMD-5 「추천」 (moved from system)
        key: "growth-rec",
        title: "",
        status: "done",
        children: [
          {
            key: "manage-ab",
            title: "",
            path: "/admin/recommendation-experiments",
            status: "done",
          },
          {
            key: "rec-analytics",
            title: "",
            path: "/admin/recommendation-analytics",
            status: "done",
          },
          {
            key: "rec-monitoring",
            title: "",
            path: "/admin/recommendation-monitoring",
            status: "done",
          },
          {
            key: "rec-deployments",
            title: "",
            path: "/admin/recommendation-deployments",
            status: "done",
          },
          {
            key: "rec-automation",
            title: "",
            path: "/admin/recommendation-automation",
            status: "done",
          },
          {
            key: "manage-reports",
            title: "",
            path: "/admin/recommendation-reports",
            status: "done",
          },
        ],
      },
      // 재감사 G-12: 카테고리·주제·업종 중앙 진입 (원장 3종은 분류 체계가 달라 그대로 — 원래 메뉴는 각 도메인)
      {
        key: "promotion-section-taxonomy",
        title: "",
        status: "done",
        children: [
          {
            key: "taxonomy-trade",
            title: "",
            path: "/admin/menus/trade",
            entryAlias: true,
            status: "done",
          },
          {
            key: "taxonomy-community",
            title: "",
            path: "/admin/community/topics",
            entryAlias: true,
            status: "done",
          },
          {
            key: "taxonomy-delivery",
            title: "",
            path: "/admin/stores/application-settings?menu=stores&focus=category",
            entryAlias: true,
            status: "done",
          },
        ],
      },
      {
        // J-AMD-5 「공통 콘텐츠」 (moved from system › 시스템 허브)
        key: "cp-content",
        title: "",
        status: "partial",
        children: [
          { key: "cp-notice", title: "", path: "/admin/app/notices", status: "done" },
          {
            // O-8: no page yet — hidden from sidebar (code kept).
            key: "cp-faq",
            title: "",
            path: "/admin/customer-platform/faq",
            pendingRoute: true,
            status: "todo",
            sidebarPublic: false,
          },
          { key: "cp-legal", title: "", path: "/admin/app/legal", status: "done" },
          { key: "cp-business", title: "", path: "/admin/app/business", status: "done" },
        ],
      },
    ],
  },

  // ── SUPPORT ────────────────────────────────────
  // B7: B6 Control Plane → archive.
  // J-AMD-3: /admin/store-inquiries is a primary leaf under delivery › 매장 (not support).
  // J-AMD-3: global pending-work queue (/admin/order-notifications) follows admin-inbox.
  {
    key: "support",
    title: "",
    children: [
      {
        key: "cp-support-center",
        title: "",
        path: "/admin/support",
        status: "done",
      },
      // 재감사 G-07·G-08 (Owner 승인 2026-10-30): 중앙 이의신청(전 도메인) · 매장 문의 조회 보기 — 같은 관제 화면의 보기
      { key: "cp-support-appeals", title: "", path: "/admin/support?type=appeal", status: "done" },
      { key: "cp-support-store-inquiries", title: "", path: "/admin/support?view=store_inquiries", status: "done" },
      {
        key: "cp-support-archive",
        title: "",
        path: "/admin/support/archive",
        status: "done",
      },
      // R13 — Admin notification inbox (admin_notifications). ≠ Action Queue bell.
      {
        key: "admin-inbox",
        title: "",
        path: "/admin/inbox",
        status: "done",
      },
      {
        key: "delivery-order-notifications",
        title: "",
        path: "/admin/order-notifications",
        status: "done",
      },
    ],
  },

  // ── NOTIFICATIONS ──────────────────────────────
  // B7: operational send tools → sound/preferences CONFIG → devices.
  {
    key: "notifications",
    title: "",
    children: [
      {
        key: "cp-notification-engine",
        title: "",
        path: "/admin/notifications",
        // J-AMD-5: former promotion 「알림」 link hub (URL kept, no separate leaf).
        matchPaths: ["/admin/platform-promotion/notifications"],
        status: "done",
      },
      {
        key: "settings-notifications",
        title: "",
        path: "/admin/settings/notifications",
        status: "done",
      },
      { key: "push-devices", title: "", path: "/admin/push-devices", status: "done" },
    ],
  },

  // ── SYSTEM ─────────────────────────────────────
  // J-AMD-5 (Owner O-2 · O-3): flat operator leaves + master-only 「내부 도구」 section.
  // Previously master-only leaves keep `roles: ["master"]` (no visibility change).
  // 운영 가이드 (/admin/docs/board) is visible to every admin. Keys / paths unchanged.
  {
    key: "system",
    title: "",
    children: [
      { key: "cp-dashboard", title: "", path: "/admin/customer-platform", status: "done" },
      {
        key: "cp-monitoring",
        title: "",
        path: "/admin/customer-platform#monitoring",
        status: "done",
      },
      {
        key: "system-status",
        title: "",
        path: "/admin/system",
        roles: ["master"],
        status: "done",
      },
      {
        key: "runtime-health",
        title: "",
        path: "/admin/runtime-health",
        roles: ["master"],
        status: "done",
      },
      {
        key: "delivery-release-gate",
        title: "",
        path: "/admin/delivery-release-gate",
        roles: ["master"],
        status: "done",
      },
      {
        key: "system-deploy",
        title: "",
        path: "/admin/system/deploy",
        roles: ["master"],
        status: "done",
      },
      { key: "settings-general", title: "", path: "/admin/settings", status: "done" },
      { key: "settings-auth", title: "", path: "/admin/settings/auth", status: "done" },
      {
        key: "system-hotfix",
        title: "",
        path: "/admin/feed-emergency",
        roles: ["master"],
        status: "done",
      },
      {
        key: "system-prelaunch-reset",
        title: "",
        path: "/admin/system/data-reset",
        matchPaths: ["/admin/system/data-reset", "/admin/prelaunch-reset"],
        roles: ["master"],
        status: "done",
      },
      { key: "ops-docs-board", title: "", path: "/admin/docs/board", status: "done" },
      // O-8: TODO empty screens — hidden from sidebar (code / URL kept).
      {
        key: "app-countries",
        title: "",
        path: "/admin/app/countries",
        status: "done",
        sidebarPublic: false,
      },
      {
        key: "app-languages",
        title: "",
        path: "/admin/app/languages",
        status: "done",
        sidebarPublic: false,
      },
      // 2026-10-30 Owner: 앱 버전·업데이트 설정은 사이드바에 노출 (강제 업데이트 켜기/끄기).
      { key: "app-meta", title: "", path: "/admin/app/meta", status: "done" },
      {
        // J-AMD-5 「내부 도구」 (section key reused from the former master-only 플랫폼 시스템 group)
        key: "platform-system",
        title: "",
        roles: ["master"],
        children: [
          { key: "manage-ops-board", title: "", path: "/admin/ops-board", status: "done" },
          { key: "manage-docs", title: "", path: "/admin/ops-docs", status: "done" },
          { key: "manage-runbooks", title: "", path: "/admin/ops-runbooks", status: "done" },
          { key: "manage-kb", title: "", path: "/admin/ops-knowledge", status: "done" },
          { key: "manage-kg", title: "", path: "/admin/ops-knowledge-graph", status: "done" },
          { key: "manage-learning", title: "", path: "/admin/ops-learning", status: "done" },
          { key: "manage-maturity", title: "", path: "/admin/ops-maturity", status: "done" },
          { key: "manage-benchmarks", title: "", path: "/admin/ops-benchmarks", status: "done" },
          { key: "system-qa", title: "", path: "/admin/qa-board", status: "done" },
          { key: "system-longrun", title: "", path: "/admin/ops-routines", status: "done" },
          { key: "system-backlog", title: "", path: "/admin/product-backlog", status: "done" },
          { key: "system-sprint", title: "", path: "/admin/dev-sprints", status: "done" },
          {
            key: "system-release-notes",
            title: "",
            path: "/admin/release-notes",
            status: "done",
          },
          {
            key: "system-release-archive",
            title: "",
            path: "/admin/release-archive",
            status: "done",
          },
          {
            key: "system-release-migration",
            title: "",
            path: "/admin/production-migration",
            status: "done",
          },
          { key: "system-backup", title: "", path: "/admin/backup", status: "done" },
          { key: "system-dr", title: "", path: "/admin/dr", status: "done" },
          { key: "system-automation", title: "", path: "/admin/automation", status: "done" },
          {
            key: "ops-launch-readiness",
            title: "",
            path: "/admin/launch-readiness",
            status: "done",
          },
          { key: "ops-launch-week", title: "", path: "/admin/launch-week", status: "done" },
          { key: "system-security", title: "", path: "/admin/security", status: "done" },
          { key: "system-performance", title: "", path: "/admin/performance", status: "done" },
          { key: "system-usage", title: "", path: "/admin/usage", status: "done" },
          { key: "ops-memo", title: "", path: "/admin/memo", status: "done" },
        ],
      },
    ],
  },
]);

/** path가 있는 모든 노드(클릭 가능한 메뉴 엔트리)를 DFS로 수집 */
/**
 * 메뉴 leaf 경로 목록. 기본은 원래 메뉴(canonical)만 — 별칭 진입점(`entryAlias`)은 같은 화면의 두 번째 입구라
 * 「경로 1개 = 원래 메뉴 1개」 계약에서 뺀다 (재감사 E-8 · Owner 승인: 진입점 복수 허용, 원장·화면은 하나).
 */
export function collectAdminMenuPathEntries(
  items: AdminMenuItem[] = adminMenu,
  opts?: { includeEntryAliases?: boolean }
): { key: string; path: string; pendingRoute?: true; entryAlias?: true }[] {
  const out: { key: string; path: string; pendingRoute?: true; entryAlias?: true }[] = [];
  function walk(nodes: AdminMenuItem[]) {
    for (const node of nodes) {
      if (node.path && (opts?.includeEntryAliases || !node.entryAlias)) {
        out.push({ key: node.key, path: node.path, pendingRoute: node.pendingRoute, entryAlias: node.entryAlias });
      }
      if (node.children?.length) walk(node.children);
    }
  }
  walk(items);
  return out;
}

/**
 * role 기준 메뉴 필터링. 항목/자식의 roles 미지정 시 전체 노출, 지정 시 해당 role만 노출.
 * NOTE: does NOT strip `sidebarPublic: false` — workspace routing / deep-link match
 * must still see ads-legacy paths. Use `filterMenuForPublicSidebar` for nav UI.
 */
export function filterMenuByRole(
  menu: AdminMenuItem[],
  role: AdminMenuRole
): AdminMenuItem[] {
  function filter(items: AdminMenuItem[]): AdminMenuItem[] {
    return items
      .filter((item) => !item.roles?.length || item.roles.includes(role))
      .map((item) => ({
        ...item,
        children: item.children?.length ? filter(item.children) : undefined,
      }))
      .filter((item) => !item.children || item.children.length > 0 || item.path);
  }
  return filter(menu);
}

/**
 * PUBLIC sidebar / workspace nav display — retires `sidebarPublic: false` leaves
 * while keeping them in adminMenu for routing matchPaths / findAdminMenuByKey.
 */
export function filterMenuForPublicSidebar(menu: AdminMenuItem[]): AdminMenuItem[] {
  function filter(items: AdminMenuItem[]): AdminMenuItem[] {
    return items
      .filter((item) => item.sidebarPublic !== false)
      .map((item) => ({
        ...item,
        children: item.children?.length ? filter(item.children) : undefined,
      }))
      .filter((item) => !item.children || item.children.length > 0 || item.path);
  }
  return filter(menu);
}
