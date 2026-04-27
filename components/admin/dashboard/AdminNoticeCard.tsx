"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminNoticeCard() {
  const { t } = useI18n();
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h2 className="mb-2 sam-text-body font-medium text-sam-fg">
        {t("admin_dashboard_notice_title")}
      </h2>
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_dashboard_notice_placeholder")}
      </p>
    </div>
  );
}
