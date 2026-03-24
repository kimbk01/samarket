"use client";

import { useMemo } from "react";
import { getProductBacklogSummary } from "@/lib/product-backlog/mock-product-backlog-summary";
import { getProductBacklogItems } from "@/lib/product-backlog/mock-product-backlog-items";
import { getCategoryLabel } from "@/lib/product-backlog/product-backlog-utils";
import type { ProductFeedbackCategory } from "@/lib/types/product-backlog";
import Link from "next/link";

export function ProductBacklogSummaryCards() {
  const summary = useMemo(() => getProductBacklogSummary(), []);
  const recommendedCount = useMemo(
    () =>
      getProductBacklogItems().filter(
        (i) =>
          i.impactScore >= 7 &&
          i.effortScore <= 4 &&
          !["released", "rejected", "archived"].includes(i.status)
      ).length,
    []
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">피드백 / 백로그</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.totalFeedbackItems} / {summary.totalBacklogItems}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">인박스·예정·진행·릴리즈</p>
          <p className="text-[14px] text-gray-700">
            {summary.inboxCount} / {summary.plannedCount} /{" "}
            {summary.inProgressCount} / {summary.releasedCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">많이 들어온 카테고리</p>
          <p className="text-[14px] font-medium text-gray-900">
            {summary.topCategory
              ? getCategoryLabel(summary.topCategory as ProductFeedbackCategory)
              : "-"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">우선 추천 (impact↑ effort↓)</p>
          <p className="text-[20px] font-semibold text-gray-900">{recommendedCount}건</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">연결</p>
          <p className="text-[13px] text-gray-700">
            <Link href="/admin/ops-board" className="text-signature hover:underline">
              액션아이템
            </Link>
            {" · "}
            <Link href="/admin/recommendation-reports" className="text-signature hover:underline">
              보고서
            </Link>
            {" · "}
            <Link href="/admin/qa-board" className="text-signature hover:underline">
              QA보드
            </Link>
          </p>
        </div>
      </div>
      <p className="text-[12px] text-gray-500">
        최종 반영: {new Date(summary.latestUpdatedAt).toLocaleString()}
      </p>
    </div>
  );
}
