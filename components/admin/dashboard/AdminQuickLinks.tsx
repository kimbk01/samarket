"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const LINKS: { href: string; labelKey: MessageKey }[] = [
  { href: "/admin/products", labelKey: "admin_menu_trade_products" },
  { href: "/admin/users", labelKey: "admin_menu_users" },
  { href: "/admin/reports", labelKey: "admin_menu_reports" },
  { href: "/admin/chats", labelKey: "admin_menu_chat" },
  { href: "/admin/reviews", labelKey: "admin_menu_reviews" },
  { href: "/admin/banners", labelKey: "admin_quicklink_banners" },
  { href: "/admin/business", labelKey: "admin_menu_business_management" },
  { href: "/admin/ad-applications", labelKey: "admin_menu_ads_applications" },
  { href: "/admin/promoted-items", labelKey: "admin_menu_ads_paid" },
  { href: "/admin/feed-ads", labelKey: "admin_menu_ads_feed" },
  { href: "/admin/point-charges", labelKey: "admin_menu_points_charge" },
  { href: "/admin/points/ledger", labelKey: "admin_menu_points_ledger" },
  { href: "/admin/point-policies", labelKey: "admin_menu_points_policy" },
  { href: "/admin/point-executions", labelKey: "admin_menu_points_execute" },
  { href: "/admin/points/expire", labelKey: "admin_menu_points_expire" },
  { href: "/admin/member-benefits", labelKey: "admin_menu_ads_benefits" },
  { href: "/admin/exposure-policies", labelKey: "admin_menu_ads_policy" },
  { href: "/admin/home-feed", labelKey: "admin_menu_ads_home_feed" },
  { href: "/admin/personalized-feed", labelKey: "admin_menu_ads_recommendation" },
  { href: "/admin/recommendation-analytics", labelKey: "admin_quicklink_recommendation_analytics" },
  { href: "/admin/recommendation-experiments", labelKey: "admin_menu_manage_ab" },
  { href: "/admin/recommendation-deployments", labelKey: "admin_quicklink_recommendation_deployments" },
  { href: "/admin/feed-emergency", labelKey: "admin_menu_dev_hotfix" },
  { href: "/admin/recommendation-monitoring", labelKey: "admin_quicklink_recommendation_monitoring" },
  { href: "/admin/recommendation-automation", labelKey: "admin_quicklink_recommendation_automation" },
  { href: "/admin/recommendation-reports", labelKey: "admin_menu_manage_reports" },
  { href: "/admin/ops-board", labelKey: "admin_menu_manage_ops_board" },
  { href: "/admin/ops-docs", labelKey: "admin_menu_manage_docs" },
  { href: "/admin/ops-runbooks", labelKey: "admin_menu_manage_runbooks" },
  { href: "/admin/ops-knowledge", labelKey: "admin_menu_manage_kb" },
  { href: "/admin/ops-knowledge-graph", labelKey: "admin_menu_manage_kg" },
  { href: "/admin/ops-learning", labelKey: "admin_menu_manage_learning" },
  { href: "/admin/ops-maturity", labelKey: "admin_menu_manage_maturity" },
  { href: "/admin/ops-benchmarks", labelKey: "admin_menu_manage_benchmarks" },
  { href: "/admin/launch-readiness", labelKey: "admin_quicklink_launch_readiness" },
  { href: "/admin/production-migration", labelKey: "admin_menu_dev_production" },
  { href: "/admin/qa-board", labelKey: "admin_menu_dev_qa" },
  { href: "/admin/launch-week", labelKey: "admin_quicklink_launch_week" },
  { href: "/admin/ops-routines", labelKey: "admin_menu_dev_longterm" },
  { href: "/admin/product-backlog", labelKey: "admin_menu_dev_backlog" },
  { href: "/admin/dev-sprints", labelKey: "admin_menu_dev_sprints" },
  { href: "/admin/release-notes", labelKey: "admin_menu_dev_release_notes" },
  { href: "/admin/release-archive", labelKey: "admin_menu_dev_release_archive" },
  { href: "/admin/backup", labelKey: "admin_menu_dev_backup" },
  { href: "/admin/dr", labelKey: "admin_menu_dev_dr" },
  { href: "/admin/security", labelKey: "admin_menu_dev_security" },
  { href: "/admin/performance", labelKey: "admin_menu_dev_performance" },
  { href: "/admin/usage", labelKey: "admin_menu_dev_usage" },
  { href: "/admin/automation", labelKey: "admin_menu_dev_automation" },
  { href: "/admin/system", labelKey: "admin_menu_dev_system_status" },
  { href: "/admin/settings", labelKey: "admin_menu_settings_general" },
  { href: "/admin/audit-logs", labelKey: "admin_menu_dev_audit" },
];

export function AdminQuickLinks() {
  const { t } = useI18n();

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h2 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_quicklinks_title")}</h2>
      <ul className="flex flex-wrap gap-2">
        {LINKS.map(({ href, labelKey }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-block rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg hover:border-signature hover:bg-signature/5 hover:text-signature"
            >
              {t(labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
