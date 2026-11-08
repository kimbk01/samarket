"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getOpsBenchmarkSummary } from "@/lib/ops-benchmarks/ops-benchmark-summary";
import { getOpsQuarterlyPlanSummary } from "@/lib/ops-benchmarks/ops-quarterly-plan-summary";
import { getOpsPerformanceReviewSummary } from "@/lib/ops-benchmarks/ops-performance-review-summary";
import Link from "next/link";

export function OpsBenchmarkSummaryCards() {
  const { t } = useI18n();
  const benchmarkSummary = useMemo(
    () => getOpsBenchmarkSummary("quarterly"),
    []
  );
  const planSummary = useMemo(() => getOpsQuarterlyPlanSummary(), []);
  const reviewSummary = useMemo(
    () => getOpsPerformanceReviewSummary(),
    []
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_benchmark_summary_3")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {t("admin_ops_benchmarks_avg_current_target", { current: benchmarkSummary.averageCurrentScore, target: benchmarkSummary.averageTargetScore })}
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {t("admin_ops_benchmarks_gap_trend_line", { highGap: benchmarkSummary.highGapDomainCount, up: benchmarkSummary.improvingDomainCount, down: benchmarkSummary.decliningDomainCount })}
        </p>
        {benchmarkSummary.latestBenchmarkDate && (
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_ops_benchmarks_base_date", { date: benchmarkSummary.latestBenchmarkDate })}
          </p>
        )}
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_benchmark_summary_4")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {t("admin_ops_benchmarks_plan_total_done", { total: planSummary.totalPlans, done: planSummary.completedCount })}
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {t("admin_ops_benchmarks_plan_status_line", { planned: planSummary.plannedCount, inProgress: planSummary.inProgressCount, atRisk: planSummary.atRiskCount, critical: planSummary.criticalOpenCount })}
        </p>
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("admin_ops_benchmarks_current_quarter", { quarter: planSummary.currentQuarter })}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_benchmark_summary_5")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {t("admin_ops_benchmarks_review_count_avg", { count: reviewSummary.totalReviewedAdmins, avg: reviewSummary.averageOverallPerformanceScore })}
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {t("admin_ops_benchmarks_review_high_attention", { high: reviewSummary.highPerformersCount, attention: reviewSummary.needsAttentionCount })}
        </p>
        {reviewSummary.latestReviewPeriod && (
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_ops_benchmarks_review_period", { period: reviewSummary.latestReviewPeriod })}
          </p>
        )}
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:col-span-2 lg:col-span-3">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_benchmark_k0448a340")}</p>
        <p className="mt-1 sam-text-body text-sam-fg">
          <Link href="/admin/ops-maturity" className="text-signature hover:underline">
            {t("admin_ops_benchmarks_link_maturity")}
          </Link>
          {" · "}
          <Link href="/admin/ops-board" className="text-signature hover:underline">
            {t("admin_ops_benchmarks_link_board")}
          </Link>
          {" · "}
          <Link href="/admin/ops-learning" className="text-signature hover:underline">
            {t("admin_ops_benchmarks_link_learning")}
          </Link>
        </p>
      </div>
    </div>
  );
}
