"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAutomationLogs } from "@/lib/automation/mock-automation-logs";
import { getAutomationRuleById } from "@/lib/automation/mock-automation-rules";

export function AutomationLogList() {
  const { t } = useI18n();
  const logs = useMemo(() => getAutomationLogs(), []);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_automation_logs_helper")}</p>
      {logs.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_automation_logs_empty")}
        </div>
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
                  {new Date(l.triggeredAt).toLocaleString()}
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
