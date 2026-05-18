"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationEscalationRules } from "@/lib/recommendation-automation/mock-recommendation-escalation-rules";
import {
  recAlertSeverityLabel,
  recEscalationChannelLabel,
  recEscalationTriggerLabel,
} from "@/components/admin/recommendation-admin-i18n";

export function EscalationRuleTable() {
  const { t } = useI18n();
  const rules = useMemo(() => getRecommendationEscalationRules(), []);

  if (rules.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rec_auto_empty_escalation")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_step")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_severity")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_trigger")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_channel")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_delay_min")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_enabled")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {r.stepOrder}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                    r.severity === "critical"
                      ? "bg-red-50 text-red-800"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {recAlertSeverityLabel(t, r.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {recEscalationTriggerLabel(t, r.triggerType)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {recEscalationChannelLabel(t, r.channel)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.delayMinutes}
              </td>
              <td className="px-3 py-2.5">
                {r.isActive ? (
                  <span className="sam-text-body-secondary text-emerald-600">ON</span>
                ) : (
                  <span className="sam-text-body-secondary text-sam-meta">OFF</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
