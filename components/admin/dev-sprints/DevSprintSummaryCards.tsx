"use client";

import { useMemo } from "react";
import { getDevSprintSummary } from "@/lib/dev-sprints/mock-dev-sprint-summary";
import Link from "next/link";

export function DevSprintSummaryCards() {
  const summary = useMemo(() => getDevSprintSummary(), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">스프린트 / 진행중</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.totalSprints} / {summary.activeSprints}
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">작업 / 완료 / 블로킹</p>
          <p className="text-[14px] text-gray-700">
            {summary.totalItems} / {summary.completedItems} /{" "}
            <span className={summary.blockedItems > 0 ? "font-medium text-red-600" : ""}>
              {summary.blockedItems}
            </span>
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">velocity (placeholder)</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.averageVelocity}
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">최신 릴리즈</p>
          <p className="text-[14px] font-medium text-gray-900">
            {summary.latestReleaseVersion ?? "-"}
          </p>
        </div>
      </div>
      {summary.blockedItems > 0 && (
        <div className="rounded-ui-rect border border-red-200 bg-red-50/50 p-3 text-[13px] text-red-800">
          블로킹된 개발 작업이 {summary.blockedItems}건 있습니다. 스프린트 보드에서 확인하세요.
        </div>
      )}
      <p className="text-[12px] text-gray-500">
        <Link href="/admin/product-backlog" className="text-signature hover:underline">
          제품 백로그
        </Link>
        {" · "}
        <Link href="/admin/qa-board" className="text-signature hover:underline">
          QA보드
        </Link>
        {" · "}
        <Link href="/admin/release-notes" className="text-signature hover:underline">
          릴리즈 노트
        </Link>
      </p>
      <p className="text-[12px] text-gray-500">
        최종 반영: {new Date(summary.latestUpdatedAt).toLocaleString()}
      </p>
    </div>
  );
}
