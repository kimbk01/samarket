"use client";

import { useMemo } from "react";
import { getOpsOperationalizationStatus } from "@/lib/ops-routines/mock-ops-operationalization-status";
import { getOperationalizationLabel } from "@/lib/ops-routines/ops-routines-utils";
import Link from "next/link";

export function OpsOperationalizationStatusCard() {
  const status = useMemo(() => getOpsOperationalizationStatus(), []);

  const statusClass =
    status.overallStatus === "optimized"
      ? "text-emerald-700"
      : status.overallStatus === "needs_attention"
        ? "text-red-700"
        : status.overallStatus === "established"
          ? "text-blue-700"
          : "text-amber-700";

  const statusBg =
    status.overallStatus === "optimized"
      ? "border-emerald-200 bg-emerald-50/30"
      : status.overallStatus === "needs_attention"
        ? "border-red-200 bg-red-50/50"
        : status.overallStatus === "established"
          ? "border-blue-200 bg-blue-50/30"
          : "border-amber-200 bg-amber-50/30";

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${statusBg}`}>
        <p className="text-[12px] text-gray-500">운영 체계 정착 상태</p>
        <p className={`text-[22px] font-semibold ${statusClass}`}>
          {getOperationalizationLabel(status.overallStatus)}
        </p>
        <p className="mt-2 text-[13px] text-gray-600">
          평가일: {new Date(status.evaluatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">루틴 완료율</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {status.routineCompletionRate}%
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">지연 / 이월</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {status.overdueRoutineCount} / {status.carryOverCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">문서 최신화 / 액션 마감율</p>
          <p className="text-[14px] text-gray-700">
            {status.documentationFreshnessRate}% / {status.actionClosureRate}%
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[13px] text-gray-600">
        <span>월간 리뷰: {status.monthlyReviewDone ? "완료" : "미완료"}</span>
        <span>벤치마크 리뷰: {status.benchmarkReviewDone ? "완료" : "미완료"}</span>
      </div>

      <p className="text-[13px] text-gray-600">
        <Link href="/admin/ops-board" className="text-signature hover:underline">
          운영 보드
        </Link>
        {" · "}
        <Link href="/admin/ops-maturity" className="text-signature hover:underline">
          성숙도
        </Link>
        {" · "}
        <Link href="/admin/ops-benchmarks" className="text-signature hover:underline">
          벤치마크
        </Link>
        {" · "}
        <Link href="/admin/launch-week" className="text-signature hover:underline">
          첫 주 관제
        </Link>
      </p>

      {status.note && (
        <p className="text-[13px] text-gray-500">{status.note}</p>
      )}
    </div>
  );
}
