"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { HomeFeedGenerationLog } from "@/lib/types/home-feed";
import { SECTION_LABELS } from "@/lib/home-feed/home-feed-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

interface HomeFeedGenerationLogListProps {
  logs: HomeFeedGenerationLog[];
}

export function HomeFeedGenerationLogList({ logs }: HomeFeedGenerationLogListProps) {
  const { t } = useI18n();
  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_home_feed_log_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_log_col_generated_at")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_log_col_user_region")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_log_col_section")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_log_col_counts")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_log_col_ads")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_log_col_note")}
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(log.generatedAt)}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-sam-fg">
                {log.userRegion}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SECTION_LABELS[log.sectionKey]}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_home_feed_log_counts_value", { candidates: log.candidateCount, results: log.finalCount, deduped: log.dedupedCount })}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{log.sponsoredIncluded}</td>
              <td className="max-w-[120px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {log.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
