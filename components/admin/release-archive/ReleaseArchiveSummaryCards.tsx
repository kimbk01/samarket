"use client";

import { useMemo } from "react";
import { getReleaseArchiveSummary } from "@/lib/release-archive/mock-release-archive-summary";
import { getReleaseArchives } from "@/lib/release-archive/mock-release-archives";
import { getReleaseArchiveItems } from "@/lib/release-archive/mock-release-archive-items";
import { getReleaseRegressionIssues } from "@/lib/release-archive/mock-release-regression-issues";
import Link from "next/link";

export function ReleaseArchiveSummaryCards() {
  const { summary, latestImpact } = useMemo(() => {
    const summaryInner = getReleaseArchiveSummary();
    const archives = getReleaseArchives();
    const latest = [...archives].sort(
      (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    )[0];
    let latestImpactInner: { version: string; changeCount: number; regressionCount: number } | null =
      null;
    if (latest) {
      const changeCount = getReleaseArchiveItems(latest.id).length;
      const regressionCount = getReleaseRegressionIssues({
        releaseArchiveId: latest.id,
      }).length;
      latestImpactInner = { version: latest.releaseVersion, changeCount, regressionCount };
    }
    return { summary: summaryInner, latestImpact: latestImpactInner };
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">릴리즈 / 활성 / 안정 / 롤백</p>
          <p className="text-[14px] text-gray-700">
            {summary.totalReleases} / {summary.activeReleases} /{" "}
            {summary.stableReleases} / {summary.rolledBackReleases}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">회귀 이슈 / 미해결 / critical</p>
          <p className="text-[14px] text-gray-700">
            {summary.totalRegressionIssues} /{" "}
            <span className={summary.openRegressionIssues > 0 ? "font-medium text-amber-700" : ""}>
              {summary.openRegressionIssues}
            </span>
            {" / "}
            <span className={summary.criticalRegressionIssues > 0 ? "font-medium text-red-600" : ""}>
              {summary.criticalRegressionIssues}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">릴리즈당 평균 회귀 (placeholder)</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.averageRegressionPerRelease}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">최신 릴리즈일</p>
          <p className="text-[14px] font-medium text-gray-900">
            {summary.latestReleaseAt}
          </p>
        </div>
        {latestImpact && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-[12px] text-gray-500">릴리즈별 영향 범위 (최신)</p>
            <p className="text-[14px] font-medium text-gray-900">
              v{latestImpact.version}
            </p>
            <p className="mt-1 text-[13px] text-gray-600">
              변경 {latestImpact.changeCount}건 · 회귀 {latestImpact.regressionCount}건
            </p>
          </div>
        )}
      </div>
      <p className="text-[12px] text-gray-500">
        <Link href="/admin/release-notes" className="text-signature hover:underline">
          릴리즈 노트
        </Link>
        {" · "}
        <Link href="/admin/dev-sprints" className="text-signature hover:underline">
          스프린트
        </Link>
        {" · "}
        <Link href="/admin/qa-board" className="text-signature hover:underline">
          QA보드
        </Link>
      </p>
    </div>
  );
}
