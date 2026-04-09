"use client";

import { useMemo } from "react";
import { getOpsBenchmarkSummary } from "@/lib/ops-benchmarks/mock-ops-benchmark-summary";
import { getOpsQuarterlyPlanSummary } from "@/lib/ops-benchmarks/mock-ops-quarterly-plan-summary";
import { getOpsPerformanceReviewSummary } from "@/lib/ops-benchmarks/mock-ops-performance-review-summary";
import Link from "next/link";

export function OpsBenchmarkSummaryCards() {
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
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">벤치마크 요약</p>
        <p className="text-[20px] font-semibold text-gray-900">
          현재 평균 {benchmarkSummary.averageCurrentScore} / 목표 평균{" "}
          {benchmarkSummary.averageTargetScore}
        </p>
        <p className="mt-1 text-[13px] text-gray-600">
          갭 큰 영역 {benchmarkSummary.highGapDomainCount} · 상승{" "}
          {benchmarkSummary.improvingDomainCount} · 하락{" "}
          {benchmarkSummary.decliningDomainCount}
        </p>
        {benchmarkSummary.latestBenchmarkDate && (
          <p className="mt-1 text-[12px] text-gray-500">
            기준일 {benchmarkSummary.latestBenchmarkDate}
          </p>
        )}
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">분기 계획 요약</p>
        <p className="text-[20px] font-semibold text-gray-900">
          총 {planSummary.totalPlans}건 · 완료 {planSummary.completedCount}
        </p>
        <p className="mt-1 text-[13px] text-gray-600">
          예정 {planSummary.plannedCount} · 진행 {planSummary.inProgressCount}{" "}
          · 위험 {planSummary.atRiskCount} · 긴급 미해결{" "}
          {planSummary.criticalOpenCount}
        </p>
        <p className="mt-1 text-[12px] text-gray-500">
          현재 분기 {planSummary.currentQuarter}
        </p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">성과 리뷰 요약</p>
        <p className="text-[20px] font-semibold text-gray-900">
          리뷰 {reviewSummary.totalReviewedAdmins}명 · 평균 점수{" "}
          {reviewSummary.averageOverallPerformanceScore}
        </p>
        <p className="mt-1 text-[13px] text-gray-600">
          우수 {reviewSummary.highPerformersCount} · 관심 필요{" "}
          {reviewSummary.needsAttentionCount}
        </p>
        {reviewSummary.latestReviewPeriod && (
          <p className="mt-1 text-[12px] text-gray-500">
            기간 {reviewSummary.latestReviewPeriod}
          </p>
        )}
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4 sm:col-span-2 lg:col-span-3">
        <p className="text-[12px] text-gray-500">바로가기</p>
        <p className="mt-1 text-[14px] text-gray-700">
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
