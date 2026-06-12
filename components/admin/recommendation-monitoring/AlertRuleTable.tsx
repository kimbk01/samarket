"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getRecommendationAlertRules,
  setAlertRuleActive,
} from "@/lib/recommendation-ops/recommendation-ops-state";
import { persistRecommendationOpsToServer } from "@/lib/recommendation-ops/recommendation-ops-sync-client";
import {
  recAlertChannelLabel,
  recAlertMetricLabel,
  recAlertSeverityLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";

const COMPARATOR_LABELS: Record<string, string> = {
  lt: "<",
  gt: ">",
  eq: "=",
};

export function AlertRuleTable() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const rules = useMemo(() => getRecommendationAlertRules(), [refresh]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setAlertRuleActive(id, !isActive);
    const r = await persistRecommendationOpsToServer();
    if (!r.ok) console.warn("[recommendation-ops] persist failed:", r.error);
    setRefresh((x) => x + 1);
  };

  if (rules.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rec_mon_empty_alert_rules")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_surface")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_metric")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_condition")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_severity")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_channel")}
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
                {recSurfaceLabel(t, r.surface)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {recAlertMetricLabel(t, r.metricKey)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {COMPARATOR_LABELS[r.comparator]} {r.thresholdValue}
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
                {recAlertChannelLabel(t, r.channel)}
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => void handleToggleActive(r.id, r.isActive)}
                  className={`rounded border px-2 py-1 sam-text-body-secondary ${
                    r.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-sam-border bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {r.isActive ? "ON" : "OFF"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
