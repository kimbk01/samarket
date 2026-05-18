"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import { getLatestOpsMaturityScore } from "@/lib/ops-maturity/mock-ops-maturity-scores";
import { getMaturityScoreComparison } from "@/lib/ops-maturity/ops-maturity-utils";
import {
  OPS_TOOLS_MATURITY_SCORE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";

const domainKeys = [
  "monitoringScore",
  "automationScore",
  "documentationScore",
  "responseScore",
  "recommendationQualityScore",
  "learningScore",
] as const;

export function OpsMaturityScoreCards() {
  const { t } = useI18n();
  const [scope, setScope] = useState<"weekly" | "monthly">("weekly");
  const [targetScore, setTargetScore] = useState(75);

  const latest = useMemo(
    () => getLatestOpsMaturityScore(scope),
    [scope]
  );
  const comparison = useMemo(
    () => getMaturityScoreComparison(scope),
    [scope]
  );

  if (!latest) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_maturity_scores_empty")}</div>
    );
  }

  const gap = targetScore - latest.overallScore;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "weekly" | "monthly")}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="weekly">{t("admin_ops_tools_period_weekly")}</option>
          <option value="monthly">{t("admin_ops_tools_period_monthly")}</option>
        </select>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">{t("admin_ops_tools_maturity_target")}<input
            type="number"
            min={0}
            max={100}
            value={targetScore}
            onChange={(e) => setTargetScore(Number(e.target.value))}
            className="w-16 rounded border border-sam-border px-2 py-1 sam-text-body"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_maturity_overall")}</p>
          <p className="sam-text-hero font-semibold text-sam-fg">{latest.overallScore}</p>
          {comparison && (
            <p className={`sam-text-body-secondary ${comparison.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              전 기간 대비 {comparison.delta >= 0 ? "+" : ""}{comparison.delta}
            </p>
          )}
          {gap > 0 && (
            <p className="mt-1 sam-text-helper text-amber-600">{t("admin_ops_tools_maturity_gap")}</p>
          )}
        </div>
        {domainKeys.map((key) => (
          <div key={key} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="sam-text-helper text-sam-muted">
              {t(opsToolsLabel(OPS_TOOLS_MATURITY_SCORE_KEYS, key))}
            </p>
            <p className="sam-text-page-title font-semibold text-sam-fg">
              {latest[key]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
