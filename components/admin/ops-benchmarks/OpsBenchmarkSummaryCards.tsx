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
          현재 평균 {benchmarkSummary.averageCurrentScore} / 목표 평균{" "}
          {benchmarkSummary.averageTargetScore}
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          갭 큰 영역 {benchmarkSummary.highGapDomainCount} · 상승{" "}
          {benchmarkSummary.improvingDomainCount} · 하락{" "}
          {benchmarkSummary.decliningDomainCount}
        </p>
        {benchmarkSummary.latestBenchmarkDate && (
          <p className="mt-1 sam-text-helper text-sam-muted">
            기준일 {benchmarkSummary.latestBenchmarkDate}
          </p>
        )}
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_benchmark_summary_4")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          총 {planSummary.totalPlans}건 · 완료 {planSummary.completedCount}
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          예정 {planSummary.plannedCount} · 진행 {planSummary.inProgressCount}{" "}
          · 위험 {planSummary.atRiskCount} · 긴급 미해결{" "}
          {planSummary.criticalOpenCount}
        </p>
        <p className="mt-1 sam-text-helper text-sam-muted">
          현재 분기 {planSummary.currentQuarter}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_benchmark_summary_5")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          리뷰 {reviewSummary.totalReviewedAdmins}명 · 평균 점수{" "}
          {reviewSummary.averageOverallPerformanceScore}
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          우수 {reviewSummary.highPerformersCount} · 관심 필요{" "}
          {reviewSummary.needsAttentionCount}
        </p>
        {reviewSummary.latestReviewPeriod && (
          <p className="mt-1 sam-text-helper text-sam-muted">
            기간 {reviewSummary.latestReviewPeriod}
          </p>
        )}
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:col-span-2 lg:col-span-3">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_benchmark_k0448a340")}</p>
        <p className="mt-1 sam-text-body text-sam-fg">
          <Link href="/admin/ops-maturity" className="text-signature hover:underline">
            운영 성숙도
          </Link>
          {" · "}
          <Link href="/admin/ops-board" className="text-signature hover:underline">
            운영 보드
          </Link>
          {" · "}
          <Link href="/admin/ops-learning" className="text-signature hover:underline">
            운영 학습
          </Link>
        </p>
      </div>
    </div>
  );
}
