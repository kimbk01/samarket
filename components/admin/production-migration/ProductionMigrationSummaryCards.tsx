"use client";

import { useMemo } from "react";
import { getProductionMigrationSummary } from "@/lib/production-migration/mock-production-migration-summary";
import { getGoLiveLabel } from "@/lib/production-migration/production-migration-utils";
import Link from "next/link";

export function ProductionMigrationSummaryCards() {
  const summary = useMemo(() => getProductionMigrationSummary(), []);

  const goClass =
    summary.goLiveRecommendation === "go"
      ? "text-emerald-700"
      : summary.goLiveRecommendation === "conditional_go"
        ? "text-amber-700"
        : "text-red-700";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">테이블</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.productionReadyTables} / {summary.totalTables} 준비
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">RLS 정책</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.verifiedRlsChecks} / {summary.totalRlsChecks} 검증
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">인프라</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.readyInfraChecks} / {summary.totalInfraChecks} 준비
          </p>
        </div>
        <div
          className={`rounded-lg border p-4 ${
            summary.goLiveRecommendation === "no_go"
              ? "border-red-200 bg-red-50/50"
              : summary.goLiveRecommendation === "conditional_go"
                ? "border-amber-200 bg-amber-50/50"
                : "border-emerald-200 bg-emerald-50/30"
          }`}
        >
          <p className="text-[12px] text-gray-500">전환 Go/No-Go</p>
          <p className={`text-[20px] font-semibold ${goClass}`}>
            {getGoLiveLabel(summary.goLiveRecommendation)}
          </p>
          {summary.blockedChecks > 0 && (
            <p className="mt-1 text-[12px] text-red-600">
              차단 {summary.blockedChecks}건
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">배포 체크리스트</p>
        <p className="text-[14px] text-gray-700">
          완료 {summary.doneLaunchChecks} / {summary.totalLaunchChecks}
        </p>
        <p className="mt-1 text-[13px] text-gray-600">
          <Link href="/admin/launch-readiness" className="text-signature hover:underline">
            런칭 준비
          </Link>
          {" · "}
          <Link href="/admin/ops-board" className="text-signature hover:underline">
            운영 보드
          </Link>
        </p>
      </div>

      {summary.latestUpdatedAt && (
        <p className="text-[12px] text-gray-500">
          최종 갱신: {new Date(summary.latestUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
