"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { PersonalizedFeedLog } from "@/lib/types/personalized-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/personalized-section-labels";

interface PersonalizedFeedLogListProps {
  logs: PersonalizedFeedLog[];
}

export function PersonalizedFeedLogList({ logs }: PersonalizedFeedLogListProps) {
  const { t } = useI18n();
  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_personalized_feed_log_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_created_at")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_user")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_section")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_candidate_result_dedup")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_top_reason")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_note")}
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
                {formatAdminManilaDateTime(log.createdAt)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{log.userId}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {PERSONALIZED_SECTION_LABELS[log.sectionKey]}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_personalized_feed_log_counts", { candidates: log.candidateCount, final: log.finalCount, deduped: log.dedupedCount })}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {log.topReason}
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {log.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
