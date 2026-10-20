"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAutomationLogs, getAutomationRuleById } from "@/lib/automation/automation-state";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function AutomationLogList() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const logs = useMemo(() => getAutomationLogs(), []);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_automation_logs_helper")}</p>
      {logs.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_automation_logs_empty")} />
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => {
            const rule = getAutomationRuleById(l.ruleId);
            return (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-body-secondary text-sam-fg"
              >
                <span className="font-medium">{rule?.ruleName ?? l.ruleId}</span>
                <span className="text-sam-muted">
                  {formatAdminManilaDateTime(l.triggeredAt)}
                </span>
                <span className="text-sam-muted">→ {l.actionResult}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
