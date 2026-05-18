"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ReviewModerationLog } from "@/lib/types/admin-review";
import { REVIEW_MODERATION_ACTION_KEYS } from "@/components/admin/i18n/admin-review-label-keys";

interface AdminReviewModerationLogListProps {
  logs: ReviewModerationLog[];
}

export function AdminReviewModerationLogList({ logs }: AdminReviewModerationLogListProps) {
  const { t } = useI18n();
  if (logs.length === 0) {
    return (
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_review_empty_3")}</p>
    );
  }
  const sorted = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return (
    <ul className="space-y-2">
      {sorted.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary"
        >
          <span className="font-medium text-sam-fg">
            {t(REVIEW_MODERATION_ACTION_KEYS[log.actionType] ?? ("admin_review_action_review_only" as MessageKey))}
          </span>
          <span className="text-sam-muted">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
          <span className="text-sam-muted">· {log.adminNickname}</span>
          {log.note && (
            <span className="w-full text-sam-muted">{t("admin_log_note_prefix")}: {log.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
