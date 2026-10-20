"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KPI_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import { getOpsTeamKpis } from "@/lib/ops-maturity/ops-maturity-state";
import { getKpiComparison } from "@/lib/ops-maturity/ops-maturity-utils";
import type { OpsKpiPeriodType } from "@/lib/types/ops-maturity";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

function deltaBadge(current: number, previous: number, lowerIsBetter = false): React.ReactNode {
  const delta = current - previous;
  if (delta === 0) return <span className="text-sam-muted">-</span>;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <span className={good ? "text-sam-success" : "text-sam-danger"}>
      {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
    </span>
  );
}

const KPI_EXTRAS = ["period"] as const;

export function OpsTeamKpiTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 기간 단위는 주소(`?period=`)에 보존 (R7). 기본 주간. */
  const lq = useAdminListQuery({ extras: KPI_EXTRAS, extraDefaults: { period: "weekly" } });
  const periodType: OpsKpiPeriodType = lq.query.extras.period === "monthly" ? "monthly" : "weekly";

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
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={ko ? "기간" : "Period"} name="period" value={periodType} onChange={(v) => lq.setExtra("period", v)}>
          <option value="weekly">{t("admin_ops_tools_maturity_kpi_weekly")}</option>
          <option value="monthly">{t("admin_ops_tools_maturity_kpi_monthly")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>
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
                        <span className="text-sam-success">{t("admin_ops_tools_maturity_improved")}</span>
                      ) : (
                        <span className="text-sam-danger">{t("admin_ops_tools_maturity_worsened")}</span>
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
