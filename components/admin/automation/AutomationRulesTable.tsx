"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAutomationRules } from "@/lib/automation/automation-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  AUTOMATION_ACTION_LABEL_KEYS,
  AUTOMATION_TRIGGER_LABEL_KEYS,
} from "@/lib/automation/automation-i18n-keys";

export function AutomationRulesTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const rules = useMemo(() => getAutomationRules(), []);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_automation_rules_helper")}</p>
      {rules.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_automation_rules_empty")} />
      ) : (
        <AdminTable
          headers={[
            t("admin_automation_th_rule_name"),
            t("admin_automation_th_trigger"),
            t("admin_automation_th_threshold"),
            t("admin_automation_th_action"),
            t("admin_automation_th_on_off"),
          ]}
        >
          {rules.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{r.ruleName}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t(AUTOMATION_TRIGGER_LABEL_KEYS[r.triggerType])}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {r.threshold}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t(AUTOMATION_ACTION_LABEL_KEYS[r.actionType])}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    r.isActive
                      ? "bg-sam-success-soft text-sam-success"
                      : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {r.isActive ? t("admin_automation_on") : t("admin_automation_off")}
                </span>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
