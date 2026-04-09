"use client";

import { useMemo } from "react";
import { getOpsRoutineSummary } from "@/lib/ops-routines/mock-ops-routine-summary";
import Link from "next/link";

export function OpsRoutineSummaryCards() {
  const summary = useMemo(() => getOpsRoutineSummary(), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">전체 루틴</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.completedRoutines} / {summary.totalRoutines} 완료
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">지연 / 이월</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.overdueRoutines} / {summary.carryOverRoutines}
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">주간 / 월간 / 분기 완료율</p>
          <p className="text-[14px] text-gray-700">
            {summary.weeklyCompletionRate}% / {summary.monthlyCompletionRate}% /{" "}
            {summary.quarterlyCompletionRate}%
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">연결</p>
          <p className="text-[13px] text-gray-700">
            <Link href="/admin/ops-board" className="text-signature hover:underline">
              운영 보드
            </Link>
            {" · "}
            <Link href="/admin/recommendation-reports" className="text-signature hover:underline">
              보고서
            </Link>
            {" · "}
            <Link href="/admin/ops-maturity" className="text-signature hover:underline">
              성숙도
            </Link>
            {" · "}
            <Link href="/admin/ops-benchmarks" className="text-signature hover:underline">
              벤치마크
            </Link>
          </p>
        </div>
      </div>

      {summary.latestUpdatedAt && (
        <p className="text-[12px] text-gray-500">
          최종 갱신: {new Date(summary.latestUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
