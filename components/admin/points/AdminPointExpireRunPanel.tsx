"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import type { ExpireSimulationResult } from "@/lib/points/run-point-expire";
import { simulatePointExpire, runPointExpire } from "@/lib/points/run-point-expire";

interface AdminPointExpireRunPanelProps {
  onRunComplete?: () => void;
}

export function AdminPointExpireRunPanel({
  onRunComplete,
}: AdminPointExpireRunPanelProps) {
  const { t } = useI18n();

  const [asOfDate, setAsOfDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [simResult, setSimResult] = useState<ExpireSimulationResult | null>(null);
  const [runSummary, setRunSummary] = useState<{
    totalExpired: number;
    executionCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    const result = simulatePointExpire(asOfDate);
    setSimResult(result ?? null);
    setRunSummary(null);
  };

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { executionIds, totalExpired } = runPointExpire(asOfDate, "admin");
    setRunSummary({
      totalExpired,
      executionCount: executionIds.length,
    });
    setSimResult(null);
    setLoading(false);
    onRunComplete?.();
  };

  return (
    <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h3 className="sam-text-body font-medium text-sam-fg"> {t("admin_points_expire_run_title")}
      </h3>
      <form onSubmit={handleSimulate} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-0.5 block sam-text-helper text-sam-muted"> {t("admin_points_expire_label_as_of")}
          </label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <button
          type="submit"
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        > {t("admin_points_policy_log_action_simulate")}
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={loading}
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {loading ? t("admin_points_processing") : t("admin_points_expire_btn_run")}
        </button>
      </form>
      {simResult && (
        <div className="rounded border border-amber-200 bg-amber-50/50 p-3 sam-text-body">
          <p className="font-medium text-amber-900">
            {t("admin_points_expire_sim_result", { date: simResult.asOfDate })}
          </p>
          <p className="mt-1 text-amber-800">
            {t("admin_points_expire_sim_policy", {
              policy: simResult.policyName,
              items: simResult.items.length,
              users: simResult.totalByUser.size,
            })}
          </p>
          <ul className="mt-2 list-inside list-disc sam-text-body-secondary text-amber-800">
            {Array.from(simResult.totalByUser.entries()).map(([uid, v]) => (
              <li key={uid}>
                {t("admin_points_expire_sim_user_line", {
                  nickname: v.nickname,
                  total: v.total,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {runSummary && (
        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 sam-text-body">
          <p className="font-medium text-emerald-900">{t("admin_points_expire_run_done")}</p>
          <p className="mt-1 text-emerald-800">
            {t("admin_points_expire_run_summary", {
              points: runSummary.totalExpired,
              count: runSummary.executionCount,
            })}
          </p>
        </div>
      )}
    </div>
  );
}
