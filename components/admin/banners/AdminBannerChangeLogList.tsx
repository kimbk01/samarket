"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { BannerChangeLog } from "@/lib/types/admin-banner";
import { ADMIN_BANNER_CHANGELOG_ACTION_KEYS } from "./admin-banner-i18n";

interface AdminBannerChangeLogListProps {
  logs: BannerChangeLog[];
}

export function AdminBannerChangeLogList({ logs }: AdminBannerChangeLogListProps) {
  const { t } = useI18n();

  if (logs.length === 0) {
    return (
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_banners_changelog_empty")}</p>
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
            {t(ADMIN_BANNER_CHANGELOG_ACTION_KEYS[log.actionType])}
          </span>
          <span className="text-sam-muted">{log.adminNickname}</span>
          <span className="text-sam-muted">{log.note}</span>
          <span className="ml-auto text-sam-meta">
            {new Date(log.createdAt).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
