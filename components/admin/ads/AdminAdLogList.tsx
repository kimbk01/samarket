"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdApplicationLog } from "@/lib/types/ad-application";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const ACTION_KEYS = {
  apply: "admin_ads_log_apply",
  update: "admin_ads_log_update",
  cancel: "admin_ads_log_cancel",
  mark_paid: "admin_ads_log_mark_paid",
  approve: "admin_ads_log_approve",
  reject: "admin_ads_log_reject",
  activate: "admin_ads_log_activate",
  expire: "admin_ads_log_expire",
} as const satisfies Record<AdApplicationLog["actionType"], MessageKey>;

interface AdminAdLogListProps {
  logs: AdApplicationLog[];
}

export function AdminAdLogList({ logs }: AdminAdLogListProps) {
  const { t } = useI18n();

  if (logs.length === 0) {
    return (
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_ads_log_empty")}</p>
    );
  }
  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-baseline gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary last:border-0"
        >
          <span className="font-medium text-sam-fg">{t(ACTION_KEYS[log.actionType])}</span>
          <span className="text-sam-muted">{log.actorNickname}</span>
          <span className="text-sam-muted">{log.note}</span>
          <span className="ml-auto text-sam-meta">
            {formatAdminManilaDateTime(log.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
