"use client";

import type { BusinessProfileLog } from "@/lib/types/business";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";

const ACTION_LABEL_KEYS: Record<BusinessProfileLog["actionType"], MessageKey> = {
  apply: "admin_biz_log_apply",
  approve: "admin_biz_log_approve",
  reject: "admin_biz_log_reject",
  pause: "admin_biz_log_pause",
  resume: "admin_biz_log_resume",
  update_profile: "admin_biz_log_update_profile",
};

interface AdminBusinessLogListProps {
  logs: BusinessProfileLog[];
}

export function AdminBusinessLogList({ logs }: AdminBusinessLogListProps) {
  const { t, language } = useI18n();
  if (logs.length === 0) {
    return (
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_biz_log_empty")}</p>
    );
  }
  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-baseline gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary last:border-0"
        >
          <span className="font-medium text-sam-fg">
            {t(ACTION_LABEL_KEYS[log.actionType])}
          </span>
          <span className="text-sam-muted">{log.adminNickname}</span>
          <span className="text-sam-muted">{log.note}</span>
          <span className="ml-auto text-sam-meta">
            {formatAdminDateTime(log.createdAt, language)}
          </span>
        </li>
      ))}
    </ul>
  );
}
