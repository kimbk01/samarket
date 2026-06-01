/**
 * 관리자 사이드바 메뉴 데이터 (JSON 기반, 당근형 서비스 중심)
 * - adminMenu: 단일 배열, 최상위는 대시보드(단일) + 그룹(children)
 * - path: 존재하는 app/admin 라우트는 실제 path, 없으면 임시 path + 주석 "추후 연결 필요"
 * - roles 미지정 시 전체 노출, 지정 시 해당 role만 노출 (추후 권한 연동)
 */

import type { MessageKey } from "@/lib/i18n/messages";

export type AdminMenuRole = "master" | "admin" | "operator" | "viewer";

/** 메뉴 연결 상태: 완료 / 부분 / 미연결. 미지정 시 하위로부터 자동 계산 (사이드바 접두어 미사용) */
export type AdminMenuStatus = "done" | "partial" | "todo";

export interface AdminMenuItem {
  key: string;
  title: string;
  titleKey?: MessageKey;
  path?: string;
  icon?: string;
  roles?: AdminMenuRole[];
  children?: AdminMenuItem[];
  /** true면 해당 path 페이지 미구현 — UI에서 muted 표시, 추후 연결 필요 */
  pendingRoute?: true;
  /** 연결 상태. 미지정이면 하위 메뉴 기준 자동 계산 */
  status?: AdminMenuStatus;
}

const ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY: Partial<Record<string, MessageKey>> = {
  dashboard: "admin_menu_dashboard",
  operations: "admin_menu_operations",
  users: "admin_menu_users",
  "posts-management": "admin_menu_posts_management",
  "jobs-management": "admin_menu_jobs_management",
  regions: "admin_menu_regions",
  "menu-trade": "admin_menu_menu_trade",
  "menu-main-bottom-nav": "admin_menu_main_bottom_nav",
  trade: "admin_menu_trade",
  "trade-hub": "admin_menu_trade_hub",
  "trade-products": "admin_menu_trade_products",
  "trade-settings": "admin_menu_trade_settings",
  "trade-post-ads": "admin_menu_trade_post_ads",
  "trade-ad-policies": "admin_menu_trade_ad_policies",
  "trade-feed-topics": "admin_menu_trade_topics",
  "trade-offers": "admin_menu_trade_offers",
  "trade-likes": "admin_menu_trade_likes",
  "trade-status": "admin_menu_trade_status",
  community: "admin_menu_community",
  "community-boards": "admin_menu_boards",
  "community-sections": "admin_menu_feed_sections",
  "community-topics": "admin_menu_feed_topics",
  "community-feed-settings": "admin_menu_feed_settings",
  "community-feed-reports": "admin_menu_feed_reports",
  "community-meeting-events": "admin_menu_meeting_logs",
  "community-posts": "admin_menu_posts",
  "community-comments": "admin_menu_comments",
  "community-board-categories": "admin_menu_board_categories",
  "community-popular": "admin_menu_popular_posts",
  "community-notices": "admin_menu_notices",
  business: "admin_menu_delivery",
  "store-application-settings": "admin_menu_store_application_settings",
  "stores-commerce": "admin_menu_store_review_queue",
  "store-products-admin": "admin_menu_store_products",
  "store-orders-admin": "admin_menu_store_orders",
  "delivery-orders-console": "admin_menu_delivery_ops",
  "delivery-orders-list": "admin_menu_delivery_order_list",
  "delivery-orders-cancel": "admin_menu_delivery_cancel",
  "delivery-orders-refund": "admin_menu_delivery_refund",
  "delivery-orders-settlement": "admin_menu_delivery_settlement",
  "delivery-orders-reports": "admin_menu_delivery_reports",
  "delivery-orders-logs": "admin_menu_delivery_logs",
  "delivery-bottom-nav": "admin_menu_delivery",
  "store-inquiries-admin": "admin_menu_store_inquiries",
  "store-reviews-admin": "admin_menu_store_reviews",
  "store-reports-admin": "admin_menu_store_reports",
  "store-settlements-admin": "admin_menu_store_settlements",
  "store-payment-events-admin": "admin_menu_store_payment_events",
  "commerce-settings-admin": "admin_menu_commerce_settings",
  "business-shops": "admin_menu_business_management",
  "business-posts": "admin_menu_business_posts",
  "business-coupons": "admin_menu_business_coupons",
  "business-exposure": "admin_menu_business_exposure",
  chat: "admin_menu_chat",
  "chat-all": "admin_menu_chat_all",
  "chat-trade-flow": "admin_menu_chat_flow",
  "chat-trade": "admin_menu_chat_trade",
  "chat-messenger": "admin_menu_chat_messenger",
  "chat-messenger-perf": "admin_menu_chat_messenger_performance",
  "chat-reported": "admin_menu_chat_reported",
  reviews: "admin_menu_reviews",
  "reviews-trade": "admin_menu_trade_reviews",
  "reviews-business": "admin_menu_business_reviews",
  "reviews-reported": "admin_menu_review_reports",
  reports: "admin_menu_reports",
  "reports-posts": "admin_menu_reports_all",
  "reports-comments": "admin_menu_reports_comments",
  "reports-chat": "admin_menu_reports_chat",
  "reports-users": "admin_menu_reports_users",
  "reports-logs": "admin_menu_reports_logs",
  ads: "admin_menu_ads",
  "ads-applications": "admin_menu_ads_applications",
  "ads-post-ads": "admin_menu_ads_posts",
  "ads-paid": "admin_menu_ads_paid",
  "ads-benefits": "admin_menu_ads_benefits",
  "ads-policy": "admin_menu_ads_policy",
  "ads-home-feed": "admin_menu_ads_home_feed",
  "ads-recommendation": "admin_menu_ads_recommendation",
  points: "admin_menu_points",
  "points-charge": "admin_menu_points_charge",
  "points-ledger": "admin_menu_points_ledger",
  "points-policy": "admin_menu_points_policy",
  "points-execute": "admin_menu_points_execute",
  "points-expire": "admin_menu_points_expire",
  settings: "admin_menu_settings",
  "settings-services": "admin_menu_settings_services",
  "settings-boards": "admin_menu_settings_boards",
  "settings-general": "admin_menu_settings_general",
  "settings-auth": "admin_menu_settings_auth",
  "settings-permissions": "admin_menu_settings_permissions",
  manage: "admin_menu_manage",
  "manage-experiments": "admin_menu_manage_experiments",
  "manage-ab": "admin_menu_manage_ab",
  "manage-reports": "admin_menu_manage_reports",
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
  system: "admin_menu_dev",
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
};


const ADMIN_MENU_TITLE_KEY_OVERRIDES: Partial<Record<string, MessageKey>> = {
  system: "admin_menu_dev",
  business: "admin_menu_delivery",
  "delivery-ops-console": "admin_menu_delivery_ops_console",
  "delivery-operations-stats": "admin_menu_delivery_operations_stats",
  "delivery-riders-ops": "admin_menu_delivery_riders_ops",
  "delivery-operation-alerts": "admin_menu_delivery_operation_alerts",
  "delivery-auto-actions": "admin_menu_delivery_auto_actions",
  "delivery-distance": "admin_menu_delivery_distance",
  "runtime-health": "admin_menu_runtime_health",
  "delivery-release-gate": "admin_menu_delivery_release_gate",
  "store-fee-policies-admin": "admin_menu_store_fee_policies_admin",
  "platform-inquiries-admin": "admin_menu_platform_inquiries",
  "store-points-admin": "admin_menu_store_points",
  "store-point-charges-admin": "admin_menu_store_point_charges",
  "store-point-policies-admin": "admin_menu_store_point_policies",
  "dibay-notification-campaigns": "admin_menu_dibay_notification_campaigns",
};

function resolveAdminMenuTitleKey(itemKey: string): MessageKey | undefined {
  return (
    ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY[itemKey] ??
    ADMIN_MENU_TITLE_KEY_OVERRIDES[itemKey] ??
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

/** 단일 배열: 대시보드(단일) + 실질운영/광고/포인트/설정/관리보고/개발시스템(그룹) */
export const adminMenu: AdminMenuItem[] = attachAdminMenuTitleKeys([
  {
    key: "dashboard",
    title: "",
    path: "/admin",
    status: "done",
  },
  {
    key: "operations",
    title: "",
    children: [
      { key: "users", title: "", path: "/admin/users", status: "done" },
      {
        key: "posts-management",
        title: "",
        path: "/admin/posts-management",
        status: "done",
      },
      {
        key: "jobs-management",
        title: "",
        path: "/admin/posts-management?tab=jobs",
        status: "done",
      },
      { key: "regions", title: "", path: "/admin/regions", pendingRoute: true, status: "todo" },
      { key: "menu-main-bottom-nav", title: "", path: "/admin/menus/main-bottom-nav", status: "done" },
      {
        key: "trade",
        title: "",
        path: "/admin/trade",
        children: [
          {
            key: "trade-hub",
            title: "",
            path: "/admin/trade",
            status: "done",
          },
          { key: "trade-products", title: "", path: "/admin/products", status: "partial" },
          { key: "trade-settings", title: "", path: "/admin/trade/settings", status: "done" },
          { key: "trade-post-ads", title: "", path: "/admin/trade-post-ads", status: "done" },
          { key: "trade-ad-policies", title: "", path: "/admin/trade-ad-policies", status: "done" },
          { key: "menu-trade", title: "", path: "/admin/menus/trade", status: "done" },
          { key: "trade-feed-topics", title: "", path: "/admin/trade/feed-topics", status: "done" },
          { key: "trade-offers", title: "", path: "/admin/price-offers", pendingRoute: true, status: "todo" },
          { key: "trade-likes", title: "", path: "/admin/favorites", status: "done" },
          { key: "trade-status", title: "", path: "/admin/trade-status", pendingRoute: true, status: "todo" },
        ],
      },
      {
        key: "community",
        title: "",
        path: "/admin/community/posts",
        children: [
          { key: "community-boards", title: "", path: "/admin/boards", status: "done" },
          { key: "community-sections", title: "", path: "/admin/philife/sections", status: "done" },
          { key: "community-topics", title: "", path: "/admin/philife/topics", status: "done" },
          {
            key: "community-feed-settings",
            title: "",
            path: "/admin/philife/settings",
            status: "done",
          },
          { key: "community-feed-reports", title: "", path: "/admin/philife/reports", status: "done" },
          {
            key: "community-meeting-events",
            title: "",
            path: "/admin/philife/meeting-events",
            status: "done",
          },
          { key: "community-posts", title: "", path: "/admin/community/posts", status: "done" },
          { key: "community-comments", title: "", path: "/admin/comments", status: "done" },
          { key: "community-board-categories", title: "", path: "/admin/board-categories", pendingRoute: true, status: "todo" },
          { key: "community-popular", title: "", path: "/admin/popular-posts", pendingRoute: true, status: "todo" },
          { key: "community-notices", title: "", path: "/admin/app/notices", status: "done" },
          {
            key: "dibay-notification-campaigns",
            title: "",
            path: "/admin/notifications",
            status: "done",
          },
        ],
      },
      {
        key: "business",
        title: "",
        path: "/admin/business",
        children: [
          {
            key: "delivery-bottom-nav",
            title: "",
            path: "/admin/stores/bottom-nav",
            status: "done",
          },
          {
            key: "store-application-settings",
            title: "",
            path: "/admin/stores/application-settings",
            status: "done",
          },
          {
            key: "stores-commerce",
            title: "",
            path: "/admin/stores",
            status: "partial",
          },
          {
            key: "store-products-admin",
            title: "",
            path: "/admin/store-products",
            status: "partial",
          },
          {
            key: "store-orders-admin",
            title: "",
            path: "/admin/store-orders",
            status: "partial",
          },
          {
            key: "delivery-orders-console",
            title: "",
            path: "/admin/stores/orders",
            children: [
              {
                key: "delivery-orders-list",
                title: "",
                path: "/admin/stores/orders",
                status: "done",
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
                key: "delivery-orders-settlement",
                title: "",
                path: "/admin/stores/orders/settlements",
                status: "done",
              },
              {
                key: "delivery-orders-reports",
                title: "",
                path: "/admin/stores/orders/reports",
                status: "done",
              },
              {
                key: "delivery-orders-logs",
                title: "",
                path: "/admin/stores/orders/logs",
                status: "done",
              },
            ],
          },
          {
            key: "delivery-ops-console",
            title: "Ops Console",
            path: "/admin/ops-console",
            status: "done",
          },
          {
            key: "delivery-operations-stats",
            title: "",
            path: "/admin/delivery-operations",
            status: "done",
          },
          {
            key: "delivery-riders-ops",
            title: "",
            path: "/admin/delivery-riders",
            status: "done",
          },
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
          {
            key: "delivery-distance",
            title: "",
            path: "/admin/delivery-distance",
            status: "done",
          },
          {
            key: "runtime-health",
            title: "Runtime Health",
            path: "/admin/runtime-health",
            status: "done",
          },
          {
            key: "delivery-release-gate",
            title: "Delivery Release Gate",
            path: "/admin/delivery-release-gate",
            status: "done",
          },
          {
            key: "store-inquiries-admin",
            title: "",
            path: "/admin/store-inquiries",
            status: "partial",
          },
          {
            key: "platform-inquiries-admin",
            title: "",
            path: "/admin/platform-inquiries",
            status: "done",
          },
          {
            key: "store-points-admin",
            title: "",
            path: "/admin/store-points",
            status: "done",
          },
          {
            key: "store-point-charges-admin",
            title: "",
            path: "/admin/store-point-charges",
            status: "done",
          },
          {
            key: "store-point-policies-admin",
            title: "",
            path: "/admin/store-point-policies",
            status: "done",
          },
          {
            key: "store-reviews-admin",
            title: "",
            path: "/admin/store-reviews",
            status: "partial",
          },
          {
            key: "store-reports-admin",
            title: "",
            path: "/admin/store-reports",
            status: "partial",
          },
          {
            key: "store-settlements-admin",
            title: "",
            path: "/admin/store-settlements",
            status: "partial",
          },
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
          { key: "business-posts", title: "", path: "/admin/promo-posts", pendingRoute: true, status: "todo" },
          { key: "business-coupons", title: "", path: "/admin/coupons", pendingRoute: true, status: "todo" },
          { key: "business-exposure", title: "", path: "/admin/business-exposure", pendingRoute: true, status: "todo" },
        ],
      },
      {
        key: "chat",
        title: "",
        path: "/admin/chats",
        children: [
          { key: "chat-all", title: "", path: "/admin/chats", status: "done" },
          { key: "chat-trade-flow", title: "", path: "/admin/trade-flow", status: "done" },
          { key: "chat-trade", title: "", path: "/admin/chats/trade", status: "done" },
          { key: "chat-messenger", title: "", path: "/admin/chats/messenger", status: "done" },
          {
            key: "chat-messenger-perf",
            title: "",
            path: "/admin/chats/messenger-performance",
            status: "done",
          },
          { key: "chat-reported", title: "", path: "/admin/chats/reported", status: "done" },
        ],
      },
      {
        key: "reviews",
        title: "",
        path: "/admin/reviews",
        children: [
          { key: "reviews-trade", title: "", path: "/admin/reviews", status: "done" },
          { key: "reviews-business", title: "", path: "/admin/reviews/business", pendingRoute: true, status: "todo" },
          { key: "reviews-reported", title: "", path: "/admin/reviews/reported", pendingRoute: true, status: "todo" },
        ],
      },
      {
        key: "reports",
        title: "",
        path: "/admin/reports",
        children: [
          { key: "reports-posts", title: "", path: "/admin/reports", status: "done" },
          { key: "reports-comments", title: "", path: "/admin/reports/comments", pendingRoute: true, status: "todo" },
          { key: "reports-chat", title: "", path: "/admin/reports/chats", pendingRoute: true, status: "todo" },
          { key: "reports-users", title: "", path: "/admin/reports/sanctions", pendingRoute: true, status: "todo" },
          { key: "reports-logs", title: "", path: "/admin/reports/log", pendingRoute: true, status: "todo" },
        ],
      },
    ],
  },
  {
    key: "ads",
    title: "",
    children: [
      { key: "ads-applications", title: "", path: "/admin/ad-applications", status: "done" },
      { key: "ads-post-ads", title: "", path: "/admin/post-ads", status: "done" },
      { key: "ads-paid", title: "", path: "/admin/promoted-items", status: "done" },
      { key: "ads-benefits", title: "", path: "/admin/member-benefits", status: "done" },
      { key: "ads-policy", title: "", path: "/admin/exposure-policies", status: "done" },
      { key: "ads-home-feed", title: "", path: "/admin/home-feed", status: "done" },
      { key: "ads-recommendation", title: "", path: "/admin/personalized-feed", status: "done" },
    ],
  },
  {
    key: "points",
    title: "",
    children: [
      { key: "points-charge", title: "", path: "/admin/point-charges", status: "done" },
      { key: "points-ledger", title: "", path: "/admin/points/ledger", status: "done" },
      { key: "points-policy", title: "", path: "/admin/point-policies", status: "done" },
      { key: "points-execute", title: "", path: "/admin/point-executions", status: "done" },
      { key: "points-expire", title: "", path: "/admin/points/expire", status: "done" },
    ],
  },
  {
    key: "settings",
    title: "",
    children: [
      { key: "settings-services", title: "", path: "/admin/services", pendingRoute: true, status: "todo" },
      { key: "settings-boards", title: "", path: "/admin/boards", status: "done" },
      { key: "settings-general", title: "", path: "/admin/settings", status: "done" },
      { key: "settings-auth", title: "", path: "/admin/settings/auth", status: "done" },
      { key: "settings-permissions", title: "", path: "/admin/permissions", pendingRoute: true, status: "todo" },
    ],
  },
  {
    key: "manage",
    title: "",
    children: [
      {
        key: "manage-experiments",
        title: "",
        path: "/admin/recommendation-experiments",
        children: [
          { key: "manage-ab", title: "", path: "/admin/recommendation-experiments", status: "done" },
          { key: "manage-reports", title: "", path: "/admin/recommendation-reports", status: "done" },
          { key: "manage-ops-board", title: "", path: "/admin/ops-board", status: "done" },
        ],
      },
      {
        key: "manage-knowledge",
        title: "",
        path: "/admin/ops-docs",
        children: [
          { key: "manage-docs", title: "", path: "/admin/ops-docs", status: "done" },
          { key: "manage-runbooks", title: "", path: "/admin/ops-runbooks", status: "done" },
          { key: "manage-kb", title: "", path: "/admin/ops-knowledge", status: "done" },
          { key: "manage-kg", title: "", path: "/admin/ops-knowledge-graph", status: "done" },
        ],
      },
      {
        key: "manage-eval",
        title: "",
        path: "/admin/ops-maturity",
        children: [
          { key: "manage-learning", title: "", path: "/admin/ops-learning", status: "done" },
          { key: "manage-maturity", title: "", path: "/admin/ops-maturity", status: "done" },
          { key: "manage-benchmarks", title: "", path: "/admin/ops-benchmarks", status: "done" },
        ],
      },
    ],
  },
  {
    key: "system",
    title: "",
    children: [
      { key: "system-qa", title: "", path: "/admin/qa-board", status: "done" },
      { key: "system-hotfix", title: "", path: "/admin/feed-emergency", status: "done" },
      { key: "system-longrun", title: "", path: "/admin/ops-routines", status: "done" },
      { key: "system-backlog", title: "", path: "/admin/product-backlog", status: "done" },
      { key: "system-sprint", title: "", path: "/admin/dev-sprints", status: "done" },
      {
        key: "system-release",
        title: "",
        path: "/admin/release-notes",
        children: [
          { key: "system-release-notes", title: "", path: "/admin/release-notes", status: "done" },
          { key: "system-release-archive", title: "", path: "/admin/release-archive", status: "done" },
          { key: "system-release-migration", title: "", path: "/admin/production-migration", status: "done" },
        ],
      },
      {
        key: "system-manage",
        title: "",
        path: "/admin/system",
        children: [
          { key: "system-backup", title: "", path: "/admin/backup", status: "done" },
          { key: "system-dr", title: "", path: "/admin/dr", status: "done" },
          { key: "system-security", title: "", path: "/admin/security", status: "done" },
          { key: "system-performance", title: "", path: "/admin/performance", status: "done" },
          { key: "system-usage", title: "", path: "/admin/usage", status: "done" },
          { key: "system-automation", title: "", path: "/admin/automation", status: "done" },
          { key: "system-status", title: "", path: "/admin/system", status: "done" },
        ],
      },
      { key: "system-audit", title: "", path: "/admin/audit-logs", status: "done" },
    ],
  },
]);

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
