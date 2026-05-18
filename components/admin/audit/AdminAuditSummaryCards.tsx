"use client";

import type { AuditSummary } from "@/lib/types/admin-audit";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AUDIT_CATEGORY_LABEL_KEYS } from "@/lib/admin-audit/admin-audit-i18n-keys";
import type { MessageKey } from "@/lib/i18n/messages";

function auditLocale(language: string): string {
  if (language === "en") return "en-US";
  return "ko-KR";
}

interface AdminAuditSummaryCardsProps {
  summary: AuditSummary;
}

export function AdminAuditSummaryCards({ summary }: AdminAuditSummaryCardsProps) {
  const { t, language } = useI18n();
  const locale = auditLocale(language);

  const items: { labelKey: MessageKey; value: string | number }[] = [
    { labelKey: "admin_audit_summary_today", value: summary.todayCount },
    { labelKey: "admin_audit_summary_warning", value: summary.warningCount },
    { labelKey: "admin_audit_summary_error", value: summary.errorCount },
    { labelKey: "admin_audit_summary_top_admin", value: summary.topAdminNickname },
    {
      labelKey: "admin_audit_summary_top_category",
      value: t(AUDIT_CATEGORY_LABEL_KEYS[summary.topCategory]),
    },
    {
      labelKey: "admin_audit_summary_latest",
      value: summary.latestActionAt
        ? new Date(summary.latestActionAt).toLocaleString(locale)
        : "-",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(({ labelKey, value }) => (
        <div
          key={labelKey}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        >
          <p className="sam-text-helper text-sam-muted">{t(labelKey)}</p>
          <p className="mt-0.5 truncate sam-text-body font-medium text-sam-fg">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}
