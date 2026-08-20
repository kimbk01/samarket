/**
 * 플랫폼 Admin 메뉴 SSOT (7 workspace)
 * LOCK: docs/admin/platform-admin-ia-lock.md
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
  icon?: string;
  roles?: AdminMenuRole[];
  children?: AdminMenuItem[];
  /** true면 해당 path 페이지 미구현 — UI에서 muted 표시 */
  pendingRoute?: true;
  /** 연결 상태. 미지정이면 하위 메뉴 기준 자동 계산 */
  status?: AdminMenuStatus;
}

const ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY: Partial<Record<string, MessageKey>> = {
  // Workspaces
  dashboard: "admin_menu_home",
  home: "admin_menu_home",
  common: "admin_menu_common",
  "customer-platform": "admin_menu_customer_platform",
  community: "admin_menu_community",
  trade: "admin_menu_trade",
  delivery: "admin_menu_delivery",
  messenger: "admin_menu_messenger",
  system: "admin_menu_system",
  growth: "admin_menu_growth",
  "app-config": "admin_menu_app_config",
  "platform-ops": "admin_menu_platform_ops",

  // CP
  "cp-dashboard": "admin_menu_cp_dashboard",
  "cp-action-queue": "admin_menu_cp_action_queue",
  "cp-monitoring": "admin_menu_cp_monitoring",
  "cp-support": "admin_menu_cp_support",
  "cp-member-inquiry": "admin_menu_cp_member_inquiry",
  "cp-member-inbox": "admin_menu_cp_member_inbox",
  "cp-store-inquiry": "admin_menu_store_inquiries",
  "cp-store-inbox": "admin_menu_platform_inquiries",
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
  "store-point-policies-admin": "admin_menu_store_point_policies",

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
  "chat-reported": "admin_menu_chat_reported",
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
  "community-comments": "admin_menu_community_comments",
  "community-feed-reports": "admin_menu_community_reports",
  "community-point-policies": "admin_menu_community_point_policies",
  "community-promotions": "admin_menu_community_promotions",

  // Delivery
  "stores-commerce": "admin_menu_store_review_queue",
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
  "business-shops": "admin_menu_business_management",

  // Messenger
  "chat-all": "admin_menu_chat_all",
  "chat-trade": "admin_menu_chat_trade",
  "chat-messenger": "admin_menu_chat_messenger",
  "chat-messenger-perf": "admin_menu_chat_messenger_performance",
  "messenger-advanced": "admin_menu_messenger_advanced",
  "chat-trade-messenger": "admin_menu_chat_trade_messenger_ref",
  "delivery-order-chats-messenger": "admin_menu_order_chats_messenger_ref",
  "chat-group": "admin_menu_chat_group",
  "chat-general": "admin_menu_chat_general",

  // Trade family extras (Cut B)
  "trade-users": "admin_menu_users",
  "trade-audit": "admin_menu_trade_audit",

  // Growth
  ads: "admin_menu_ads",
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
  "growth-rec": "admin_menu_growth_recommendation",
  "manage-ab": "admin_menu_manage_ab",
  "rec-analytics": "admin_menu_rec_analytics",
  "rec-monitoring": "admin_menu_rec_monitoring",
  "rec-deployments": "admin_menu_rec_deployments",
  "rec-automation": "admin_menu_rec_automation",

  // App Config
  "settings-general": "admin_menu_settings_general",
  "settings-startup-config": "admin_menu_settings_startup_config",
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
 * 7 workspace SSOT
 * DASHBOARD / COMMON / COMMUNITY / TRADE / DELIVERY / MESSENGER / SYSTEM
 */
export const adminMenu: AdminMenuItem[] = attachAdminMenuTitleKeys([
  // ── HOME ───────────────────────────────────────
  {
    key: "dashboard",
    title: "",
    path: "/admin",
    status: "done",
  },

  // ── COMMON ─────────────────────────────────────
  {
    key: "common",
    title: "",
    children: [
      { key: "users", title: "", path: "/admin/users", status: "done" },
      { key: "global-reports", title: "", path: "/admin/reports", status: "done" },
      { key: "reports-logs", title: "", path: "/admin/reports/log", status: "done" },
      { key: "audit-logs", title: "", path: "/admin/audit-logs", status: "done" },
      { key: "push-devices", title: "", path: "/admin/push-devices", status: "done" },
    ],
  },

  // ── COMMUNITY ──────────────────────────────────
  // App 2-tier Community IA Admin: topics / posts / comments / reports / ops / point(general|qna).
  // Comment report authority · topic-specific point · Manner = HOLD (do not surface as supported).
  {
    key: "community",
    title: "",
    children: [
      {
        key: "community-home",
        title: "",
        path: "/admin/community",
        status: "done",
      },
      {
        key: "community-topics",
        title: "",
        path: "/admin/community/topics",
        matchPaths: ["/admin/philife/topics", "/admin/philife"],
        status: "done",
      },
      { key: "community-posts", title: "", path: "/admin/community/posts", status: "done" },
      {
        key: "community-comments",
        title: "",
        path: "/admin/community/comments",
        status: "done",
      },
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
        key: "community-promotions",
        title: "",
        path: "/admin/community/promotions",
        status: "done",
      },
      {
        key: "community-feed-settings",
        title: "",
        path: "/admin/community/settings",
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

  // ── TRADE ──────────────────────────────────────
  // Admin → 거래 = Marketplace ops single entry (no Store finance; no Payment/Settlement).
  {
    key: "trade",
    title: "",
    children: [
      { key: "trade-hub", title: "", path: "/admin/trade", status: "done" },
      { key: "posts-management", title: "", path: "/admin/posts-management", status: "done" },
      {
        key: "jobs-management",
        title: "",
        path: "/admin/posts-management?tab=jobs",
        status: "done",
      },
      {
        key: "chat-trade-flow",
        title: "",
        path: "/admin/trade-flow",
        // MERGE: buyer-confirm was a duplicate leaf at /chats/trade-complete
        matchPaths: ["/admin/chats/trade-complete", "/admin/trade-flow?panel=complete"],
        status: "done",
      },
      { key: "chat-trade", title: "", path: "/admin/chats/trade", status: "done" },
      {
        key: "reports-posts",
        title: "",
        // SSOT leaf = product-open semantic; domain-only URL stays Trade via matchPaths.
        path: "/admin/reports?domain=trade&target_type=product",
        matchPaths: ["/admin/reports?domain=trade"],
        status: "done",
      },
      { key: "reviews-trade", title: "", path: "/admin/reviews", status: "done" },
      {
        key: "ads-applications",
        title: "",
        path: "/admin/ad-applications?domain=trade",
        status: "done",
      },
      { key: "trade-post-ads", title: "", path: "/admin/trade-post-ads", status: "done" },
      { key: "trade-ad-policies", title: "", path: "/admin/trade-ad-policies", status: "done" },
      { key: "trade-likes", title: "", path: "/admin/favorites", status: "done" },
      {
        key: "trade-users",
        title: "",
        path: "/admin/users?from=trade",
        status: "done",
      },
      {
        key: "trade-audit",
        title: "",
        path: "/admin/audit-logs?target_type=post",
        status: "done",
      },
      { key: "menu-trade", title: "", path: "/admin/menus/trade", status: "done" },
      { key: "trade-settings", title: "", path: "/admin/trade/settings", status: "done" },
    ],
  },

  // ── DELIVERY ───────────────────────────────────
  {
    key: "delivery",
    title: "",
    children: [
      { key: "stores-commerce", title: "", path: "/admin/stores", status: "partial" },
      {
        key: "store-settings-taxonomy",
        title: "",
        path: "/admin/stores/application-settings?menu=stores",
        status: "done",
      },
      {
        key: "store-settings-alerts",
        title: "",
        path: "/admin/stores/application-settings?menu=alerts",
        matchPaths: ["/admin/stores/application-settings"],
        status: "done",
      },
      {
        key: "delivery-bottom-nav",
        title: "",
        path: "/admin/stores/bottom-nav",
        matchPaths: ["/admin/delivery/bottom-nav"],
        status: "done",
      },
      { key: "store-products-admin", title: "", path: "/admin/store-products", status: "partial" },
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
        key: "delivery-order-notifications",
        title: "",
        path: "/admin/order-notifications",
        status: "done",
      },
      {
        key: "delivery-auto-actions",
        title: "",
        path: "/admin/delivery-auto-actions",
        status: "done",
      },
      { key: "delivery-distance", title: "", path: "/admin/delivery-distance", status: "done" },
      { key: "runtime-health", title: "", path: "/admin/runtime-health", status: "done" },
      {
        key: "delivery-release-gate",
        title: "",
        path: "/admin/delivery-release-gate",
        status: "done",
      },
      {
        key: "store-settlements-admin",
        title: "",
        path: "/admin/store-settlements",
        status: "partial",
      },
      { key: "store-reports-admin", title: "", path: "/admin/store-reports", status: "partial" },
      { key: "store-reviews-admin", title: "", path: "/admin/store-reviews", status: "partial" },
      {
        key: "store-fee-policies-admin",
        title: "",
        path: "/admin/store-fee-policies",
        status: "partial",
      },
      {
        key: "store-payment-events-admin",
        title: "",
        path: "/admin/store-payment-events",
        status: "partial",
      },
      {
        key: "commerce-settings-admin",
        title: "",
        path: "/admin/commerce-settings",
        status: "partial",
      },
      { key: "business-shops", title: "", path: "/admin/business", status: "done" },
    ],
  },

  // ── MESSENGER ──────────────────────────────────
  {
    key: "messenger",
    title: "",
    children: [
      {
        key: "chat-general",
        title: "",
        path: "/admin/chats/general",
        matchPaths: ["/admin/chats/community"],
        status: "done",
      },
      { key: "chat-group", title: "", path: "/admin/chats/group", status: "done" },
      {
        key: "chat-trade-messenger",
        title: "",
        path: "/admin/chats/trade?from=messenger",
        status: "done",
      },
      {
        key: "delivery-order-chats-messenger",
        title: "",
        path: "/admin/order-chats?from=messenger",
        status: "done",
      },
      { key: "chat-reported", title: "", path: "/admin/chats/reported", status: "done" },
      {
        key: "messenger-advanced",
        title: "",
        status: "partial",
        children: [
          { key: "chat-all", title: "", path: "/admin/chats", status: "done" },
          { key: "chat-messenger", title: "", path: "/admin/chats/messenger", status: "done" },
          {
            key: "chat-messenger-perf",
            title: "",
            path: "/admin/chats/messenger-performance",
            status: "done",
          },
        ],
      },
    ],
  },

  // ── SYSTEM ─────────────────────────────────────
  {
    key: "system",
    title: "",
    children: [
      {
        key: "customer-platform",
        title: "",
        children: [
          { key: "cp-dashboard", title: "", path: "/admin/customer-platform", status: "done" },
          {
            key: "cp-action-queue",
            title: "",
            path: "/admin/customer-platform#action-queue",
            status: "done",
          },
          {
            key: "cp-monitoring",
            title: "",
            path: "/admin/customer-platform#monitoring",
            status: "done",
          },
          {
            key: "cp-support",
            title: "",
            status: "done",
            children: [
              {
                key: "cp-member-inquiry",
                title: "",
                path: "/admin/member-notes?kind=inquiry",
                status: "done",
              },
              {
                key: "cp-member-inbox",
                title: "",
                path: "/admin/member-notes?kind=inbox",
                status: "done",
              },
              { key: "cp-store-inquiry", title: "", path: "/admin/store-inquiries", status: "partial" },
              { key: "cp-store-inbox", title: "", path: "/admin/platform-inquiries", status: "done" },
            ],
          },
          {
            key: "cp-member-assets",
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
            key: "cp-store-assets",
            title: "",
            status: "done",
            children: [
              {
                key: "store-point-charges-admin",
                title: "",
                path: "/admin/store-point-charges",
                status: "done",
              },
              {
                key: "store-point-ledger-admin",
                title: "",
                path: "/admin/store-point-ledger",
                status: "done",
              },
              {
                key: "store-point-policies-admin",
                title: "",
                path: "/admin/store-point-policies",
                status: "done",
              },
              { key: "store-points-admin", title: "", path: "/admin/store-points", status: "done" },
            ],
          },
          {
            key: "cp-content",
            title: "",
            status: "partial",
            children: [
              { key: "cp-notice", title: "", path: "/admin/app/notices", status: "done" },
              {
                key: "cp-faq",
                title: "",
                path: "/admin/customer-platform/faq",
                pendingRoute: true,
                status: "todo",
              },
              { key: "cp-legal", title: "", path: "/admin/app/legal", status: "done" },
              { key: "cp-business", title: "", path: "/admin/app/business", status: "done" },
            ],
          },
          {
            key: "cp-notification-engine",
            title: "",
            path: "/admin/notifications",
            status: "done",
          },
        ],
      },
      {
        key: "growth",
        title: "",
        children: [
          {
            // CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md §5
            // Primary leaves only — discoverability. Legacy under ads-legacy.
            key: "ads",
            title: "",
            status: "done",
            children: [
              { key: "ads-paid", title: "", path: "/admin/promoted-items", status: "done" },
              { key: "ads-feed", title: "", path: "/admin/feed-ads", status: "done" },
              {
                key: "ads-feed-applications",
                title: "",
                path: "/admin/ad-applications?domain=feed",
                status: "done",
              },
              {
                key: "ads-feed-products",
                title: "",
                path: "/admin/feed-ad-products",
                status: "done",
              },
              {
                key: "ads-legacy",
                title: "",
                status: "partial",
                children: [
                  { key: "ads-products", title: "", path: "/admin/ad-products", status: "partial" },
                  { key: "ads-post-ads", title: "", path: "/admin/post-ads", status: "partial" },
                  { key: "ads-benefits", title: "", path: "/admin/member-benefits", status: "done" },
                  { key: "ads-policy", title: "", path: "/admin/exposure-policies", status: "partial" },
                  { key: "ads-home-feed", title: "", path: "/admin/home-feed", status: "partial" },
                  {
                    key: "ads-recommendation",
                    title: "",
                    path: "/admin/personalized-feed",
                    status: "partial",
                  },
                  { key: "ads-banners", title: "", path: "/admin/banners", status: "partial" },
                ],
              },
            ],
          },
          {
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
        ],
      },
      {
        key: "app-config",
        title: "",
        children: [
          { key: "settings-general", title: "", path: "/admin/settings", status: "done" },
          {
            key: "settings-startup-config",
            title: "",
            path: "/admin/settings/startup-config",
            status: "done",
          },
          { key: "settings-auth", title: "", path: "/admin/settings/auth", status: "done" },
          {
            key: "settings-notifications",
            title: "",
            path: "/admin/settings/notifications",
            status: "done",
          },
          {
            key: "menu-main-bottom-nav",
            title: "",
            path: "/admin/menus/main-bottom-nav",
            status: "done",
          },
          { key: "app-categories", title: "", path: "/admin/categories", status: "done" },
          { key: "app-countries", title: "", path: "/admin/app/countries", status: "done" },
          { key: "app-languages", title: "", path: "/admin/app/languages", status: "done" },
          { key: "app-meta", title: "", path: "/admin/app/meta", status: "done" },
          { key: "my-banners", title: "", path: "/admin/my/banners", status: "done" },
          { key: "my-sections", title: "", path: "/admin/my/sections", status: "done" },
          { key: "my-services", title: "", path: "/admin/my/services", status: "done" },
        ],
      },
      {
        key: "platform-ops",
        title: "",
        children: [
          {
            key: "manage",
            title: "",
            roles: ["admin", "master"],
            children: [
              { key: "manage-ops-board", title: "", path: "/admin/ops-board", status: "done" },
              {
                key: "manage-knowledge",
                title: "",
                status: "done",
                children: [
                  { key: "manage-docs", title: "", path: "/admin/ops-docs", status: "done" },
                  { key: "manage-runbooks", title: "", path: "/admin/ops-runbooks", status: "done" },
                  { key: "manage-kb", title: "", path: "/admin/ops-knowledge", status: "done" },
                  {
                    key: "manage-kg",
                    title: "",
                    path: "/admin/ops-knowledge-graph",
                    status: "done",
                  },
                ],
              },
              {
                key: "manage-eval",
                title: "",
                status: "done",
                children: [
                  { key: "manage-learning", title: "", path: "/admin/ops-learning", status: "done" },
                  { key: "manage-maturity", title: "", path: "/admin/ops-maturity", status: "done" },
                  {
                    key: "manage-benchmarks",
                    title: "",
                    path: "/admin/ops-benchmarks",
                    status: "done",
                  },
                ],
              },
            ],
          },
          {
            key: "platform-system",
            title: "",
            roles: ["master"],
            children: [
              { key: "system-qa", title: "", path: "/admin/qa-board", status: "done" },
              { key: "system-hotfix", title: "", path: "/admin/feed-emergency", status: "done" },
              { key: "system-longrun", title: "", path: "/admin/ops-routines", status: "done" },
              { key: "system-backlog", title: "", path: "/admin/product-backlog", status: "done" },
              { key: "system-sprint", title: "", path: "/admin/dev-sprints", status: "done" },
              {
                key: "system-release",
                title: "",
                status: "done",
                children: [
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
                ],
              },
              {
                key: "system-manage",
                title: "",
                status: "done",
                children: [
                  { key: "system-backup", title: "", path: "/admin/backup", status: "done" },
                  { key: "system-dr", title: "", path: "/admin/dr", status: "done" },
                  { key: "system-security", title: "", path: "/admin/security", status: "done" },
                  {
                    key: "system-performance",
                    title: "",
                    path: "/admin/performance",
                    status: "done",
                  },
                  { key: "system-usage", title: "", path: "/admin/usage", status: "done" },
                  {
                    key: "system-automation",
                    title: "",
                    path: "/admin/automation",
                    status: "done",
                  },
                  { key: "system-status", title: "", path: "/admin/system", status: "done" },
                ],
              },
              {
                key: "ops-launch-readiness",
                title: "",
                path: "/admin/launch-readiness",
                status: "done",
              },
              { key: "ops-launch-week", title: "", path: "/admin/launch-week", status: "done" },
              { key: "ops-docs-board", title: "", path: "/admin/docs/board", status: "done" },
              { key: "ops-docs-chat", title: "", path: "/admin/docs/chat", status: "done" },
              { key: "ops-memo", title: "", path: "/admin/memo", status: "done" },
            ],
          },
        ],
      },
    ],
  },
]);

/** path가 있는 모든 노드(클릭 가능한 메뉴 엔트리)를 DFS로 수집 */
export function collectAdminMenuPathEntries(
  items: AdminMenuItem[] = adminMenu
): { key: string; path: string; pendingRoute?: true }[] {
  const out: { key: string; path: string; pendingRoute?: true }[] = [];
  function walk(nodes: AdminMenuItem[]) {
    for (const node of nodes) {
      if (node.path) {
        out.push({ key: node.key, path: node.path, pendingRoute: node.pendingRoute });
      }
      if (node.children?.length) walk(node.children);
    }
  }
  walk(items);
  return out;
}

/**
 * role 기준 메뉴 필터링. 항목/자식의 roles 미지정 시 전체 노출, 지정 시 해당 role만 노출.
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
