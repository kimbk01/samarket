"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getRecommendationAlertRules,
  setAlertRuleActive,
} from "@/lib/recommendation-ops/recommendation-ops-state";
import { commitRecommendationOpsChange } from "@/lib/recommendation-ops/recommendation-ops-sync-client";
import { AdminEmptyState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import {
  recAlertChannelLabel,
  recAlertMetricLabel,
  recAlertSeverityLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

const COMPARATOR_LABELS: Record<string, string> = {
  lt: "<",
  gt: ">",
  eq: "=",
};

export function AlertRuleTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  const rules = useMemo(() => getRecommendationAlertRules(), [refresh]);

  /** 저장 실패 → 규칙 ON/OFF 되돌림 + 실패 문구 (예전: console.warn 만). */
  const handleToggleActive = async (id: string, isActive: boolean) => {
    setBusy(true);
    const r = await commitRecommendationOpsChange(() => setAlertRuleActive(id, !isActive));
    setBusy(false);
    setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" });
    setRefresh((x) => x + 1);
  };

  if (rules.length === 0) {
    return <AdminEmptyState ko={ko} message={t("admin_rec_mon_empty_alert_rules")} />;
  }

  return (
    <div className="space-y-4">
    <AdminResultBanner ko={ko} result={saveResult} onClose={() => setSaveResult(null)} />
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
                      ? "bg-sam-danger-soft text-sam-danger"
                      : "bg-sam-warning-soft text-sam-warning"
                  }`}
                >
                  {recAlertSeverityLabel(t, r.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {recAlertChannelLabel(t, r.channel)}
              </td>
              <td className="px-3 py-2.5">
                <AdminChipButton
                  selected={r.isActive}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleToggleActive(r.id, r.isActive)}
                >
                  {r.isActive ? "ON" : "OFF"}
                </AdminChipButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
