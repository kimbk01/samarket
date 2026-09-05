"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { AdminCommunityHomeSummary } from "@/lib/admin-community/home-summary";

export function AdminCommunityHomePage({
  summary,
}: {
  summary: AdminCommunityHomeSummary | null;
}) {
  const { t } = useI18n();

  const cards = summary
    ? [
        {
          label: t("admin_community_home_today_posts"),
          value: summary.todayPosts,
          href: "/admin/community/posts?period=today",
        },
        {
          label: t("admin_community_home_today_comments"),
          value: summary.todayComments,
          href: "/admin/community/comments?period=today",
        },
        {
          label: t("admin_community_home_pending_reports"),
          value: summary.pendingReports,
          href: "/admin/community/reports?status=pending",
        },
        {
          label: t("admin_community_home_hidden_posts"),
          value: summary.hiddenPosts,
          href: "/admin/community/posts?status=hidden",
        },
      ]
    : [];

  return (
    <div className="space-y-4 text-sam-fg">
      <AdminPageHeader titleKey="admin_community_home_title" descriptionKey="admin_community_home_desc" />

      {cards.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 transition-colors hover:border-sam-primary hover:bg-sam-app"
            >
              <div className="sam-text-helper text-sam-muted">{c.label}</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-semibold tabular-nums text-sam-fg">{c.value}</span>
                <span className="sam-text-helper text-sam-primary">→</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_community_home_summary_unavailable")}</p>
      )}

      <AdminCard titleKey="admin_community_home_shortcuts_title">
        <nav className="flex flex-wrap gap-3 sam-text-body">
          <Link href="/admin/community/reports" className="text-sam-primary hover:underline">
            {t("admin_menu_community_reports")}
          </Link>
          <Link href="/admin/philife/meeting-reports" className="text-sam-primary hover:underline">
            {t("admin_menu_meeting_reports")}
          </Link>
          <Link href="/admin/community/posts" className="text-sam-primary hover:underline">
            {t("admin_menu_community_posts")}
          </Link>
          <Link href="/admin/community/comments" className="text-sam-primary hover:underline">
            {t("admin_menu_community_comments")}
          </Link>
          <Link href="/admin/community/topics" className="text-sam-primary hover:underline">
            {t("admin_menu_community_topics")}
          </Link>
          <Link href="/admin/community/promotions" className="text-sam-primary hover:underline">
            {t("admin_menu_community_promotions")}
          </Link>
          <Link href="/admin/community/point-policies" className="text-sam-primary hover:underline">
            {t("admin_menu_community_point_policies")}
          </Link>
          <Link href="/admin/community/settings" className="text-sam-primary hover:underline">
            {t("admin_menu_feed_settings")}
          </Link>
        </nav>
      </AdminCard>
    </div>
  );
}
