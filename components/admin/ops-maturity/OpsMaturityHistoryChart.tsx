"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import { getOpsMaturityHistory } from "@/lib/ops-maturity/mock-ops-maturity-history";

/** 성숙도 히스토리 추이 placeholder (표로 대체) */
export function OpsMaturityHistoryChart() {
  const { t } = useI18n();
  const history = useMemo(() => getOpsMaturityHistory(10), []);

  if (history.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_maturity_history_empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_maturity_th_date")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_maturity_th_overall")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_cat_monitoring")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_cat_automation")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_area_documentation")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_area_response")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_routine_cat_recommendation")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_ops_tools_area_learning")}</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 text-sam-fg">{h.scoreDate}</td>
              <td className="px-3 py-2.5 text-right font-medium text-sam-fg">{h.overallScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.monitoringScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.automationScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.documentationScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.responseScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.recommendationQualityScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.learningScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-3 sam-text-helper text-sam-muted">{t("admin_ops_tools_maturity_chart_ph")}</p>
    </div>
  );
}
