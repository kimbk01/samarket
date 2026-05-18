"use client";

import type { UserActivitySummary } from "@/lib/types/admin-user";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import type { MessageKey } from "@/lib/i18n/messages";

interface AdminUserSummaryCardsProps {
  summary: UserActivitySummary;
}

export function AdminUserSummaryCards({ summary }: AdminUserSummaryCardsProps) {
  const { t } = useI18n();

  const items: { labelKey: MessageKey; value: string | number }[] = [
    { labelKey: "admin_users_stat_products", value: summary.activeProducts },
    { labelKey: "admin_users_stat_sold", value: summary.soldProducts },
    { labelKey: "admin_users_stat_favorites", value: summary.favoriteCount },
    { labelKey: "admin_users_stat_reviews", value: summary.reviewCount },
    {
      labelKey: "admin_users_stat_avg_rating",
      value: summary.averageRating ? summary.averageRating.toFixed(1) : "-",
    },
    { labelKey: "admin_users_stat_reports", value: summary.reportCount },
    { labelKey: "admin_users_stat_blocked", value: summary.blockedCount },
    { labelKey: "admin_users_stat_chat_rooms", value: summary.chatRoomCount },
  ];

  return (
    <AdminCard titleKey="admin_users_card_activity_summary">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(({ labelKey, value }) => (
          <div key={labelKey} className="rounded border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper text-sam-muted">{t(labelKey)}</p>
            <p className="mt-0.5 sam-text-body font-medium text-sam-fg">{value}</p>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
