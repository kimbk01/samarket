"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KPI_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo, useState } from "react";
import { getOpsTeamKpis } from "@/lib/ops-maturity/ops-maturity-state";
import { getKpiComparison } from "@/lib/ops-maturity/ops-maturity-utils";
import type { OpsKpiPeriodType } from "@/lib/types/ops-maturity";

function deltaBadge(current: number, previous: number, lowerIsBetter = false): React.ReactNode {
  const delta = current - previous;
  if (delta === 0) return <span className="text-sam-muted">-</span>;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <span className={good ? "text-emerald-600" : "text-red-600"}>
      {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
    </span>
  );
}

export function OpsTeamKpiTable() {
  const { t } = useI18n();
  const [periodType, setPeriodType] = useState<OpsKpiPeriodType>("weekly");

  const kpis = useMemo(
    () => getOpsTeamKpis({ periodType }),
    [periodType]
  );
  const { current: currKpi, previous: prevKpi } = useMemo(
    () => getKpiComparison(periodType),
    [periodType]
  );

  const rows = useMemo(() => {
    const keys = [
      "incidentAvgResolutionMinutes",
      "fallbackRate",
      "rollbackSuccessRate",
      "documentFreshnessRate",
      "checklistCompletionRate",
      "actionCompletionRate",
      "ctrChangeRate",
      "conversionRateChange",
    ] as const;
    return keys.map((key) => {
      const curr = currKpi?.[key] ?? 0;
      const prev = prevKpi?.[key] ?? 0;
      const lowerIsBetter = key === "incidentAvgResolutionMinutes" || key === "fallbackRate";
      const isRate = key.includes("Rate") || key.includes("Change");
      const fmt = (v: number) =>
        key === "incidentAvgResolutionMinutes" ? `${v}분` : isRate ? `${(v * 100).toFixed(2)}%` : v.toFixed(2);
      return { key, label: t(opsToolsLabel(OPS_TOOLS_KPI_KEYS, key)), current: curr, previous: prev, fmt, lowerIsBetter };
    });
  }, [currKpi, prevKpi]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as OpsKpiPeriodType)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="weekly">{t("admin_ops_tools_maturity_kpi_weekly")}</option>
          <option value="monthly">{t("admin_ops_tools_maturity_kpi_monthly")}</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[520px] border-collapse sam-text-body">
          <thead>
            <tr className="border-b border-sam-border bg-sam-app">
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_maturity_th_metric")}</th>
              <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_maturity_th_current")}</th>
              <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_maturity_th_prev")}</th>
              <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_maturity_th_change")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, current, previous, fmt, lowerIsBetter }) => (
              <tr key={key} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2.5 font-medium text-sam-fg">{label}</td>
                <td className="px-3 py-2.5 text-right text-sam-fg">{fmt(current)}</td>
                <td className="px-3 py-2.5 text-right text-sam-muted">{fmt(previous)}</td>
                <td className="px-3 py-2.5 text-right">
                  {key === "incidentAvgResolutionMinutes"
                    ? (current - previous < 0 ? (
                        <span className="text-emerald-600">{t("admin_ops_tools_maturity_improved")}</span>
                      ) : (
                        <span className="text-red-600">{t("admin_ops_tools_maturity_worsened")}</span>
                      ))
                    : deltaBadge(current, previous, lowerIsBetter)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
