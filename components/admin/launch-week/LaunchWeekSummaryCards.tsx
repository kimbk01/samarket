"use client";

import { useMemo } from "react";
import { getLaunchWeekSummary } from "@/lib/launch-week/mock-launch-week-summary";
import { getStabilityLabel } from "@/lib/launch-week/launch-week-utils";
import Link from "next/link";

export function LaunchWeekSummaryCards() {
  const summary = useMemo(() => getLaunchWeekSummary(), []);

  const stabilityClass =
    summary.currentStabilityStatus === "critical"
      ? "text-red-700"
      : summary.currentStabilityStatus === "warning"
        ? "text-amber-700"
        : summary.currentStabilityStatus === "watch"
          ? "text-amber-600"
          : "text-emerald-700";

  const stabilityBg =
    summary.currentStabilityStatus === "critical"
      ? "border-red-200 bg-red-50/50"
      : summary.currentStabilityStatus === "warning"
        ? "border-amber-200 bg-amber-50/50"
        : summary.currentStabilityStatus === "watch"
          ? "border-amber-200 bg-amber-50/30"
          : "border-emerald-200 bg-emerald-50/30";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">현재 Day</p>
          <p className="text-[24px] font-semibold text-gray-900">
            Day {summary.currentDay}
          </p>
        </div>
        <div className={`rounded-lg border p-4 ${stabilityBg}`}>
          <p className="text-[12px] text-gray-500">초기 안정화 상태</p>
          <p className={`text-[20px] font-semibold ${stabilityClass}`}>
            {getStabilityLabel(summary.currentStabilityStatus)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">오픈 이슈 / Critical</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.openIssueCount} / {summary.criticalIssueCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">체크리스트</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.totalChecklistDone} / {summary.totalChecklistCount}
          </p>
          {summary.blockedChecklistCount > 0 && (
            <p className="mt-1 text-[12px] text-red-600">
              차단 {summary.blockedChecklistCount}건
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">오늘 Fallback / Kill Switch</p>
          <p className="text-[14px] text-gray-700">
            {summary.fallbackToday} / {summary.killSwitchToday}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">연결</p>
          <p className="text-[14px] text-gray-700">
            <Link href="/admin/recommendation-monitoring" className="text-signature hover:underline">
              추천 모니터링
            </Link>
            {" · "}
            <Link href="/admin/feed-emergency" className="text-signature hover:underline">
              피드 장애대응
            </Link>
            {" · "}
            <Link href="/admin/ops-board" className="text-signature hover:underline">
              운영 보드
            </Link>
            {" · "}
            <Link href="/admin/recommendation-reports" className="text-signature hover:underline">
              운영 보고서
            </Link>
          </p>
        </div>
      </div>

      <p className="text-[12px] text-gray-500">
        첫 주 go/no-go after launch 판단은 요약·체크리스트 완료 후 placeholder로 기록 가능.
      </p>

      {summary.latestUpdatedAt && (
        <p className="text-[12px] text-gray-500">
          최종 갱신: {new Date(summary.latestUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
