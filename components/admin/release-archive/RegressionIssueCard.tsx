"use client";

import type { ReleaseRegressionIssue } from "@/lib/types/release-archive";
import {
  getRegressionSeverityLabel,
  getRegressionStatusLabel,
  getRegressionCategoryLabel,
} from "@/lib/release-archive/release-archive-utils";
import Link from "next/link";

interface RegressionIssueCardProps {
  issue: ReleaseRegressionIssue;
  isRepeatingPattern?: boolean;
}

export function RegressionIssueCard({
  issue,
  isRepeatingPattern = false,
}: RegressionIssueCardProps) {
  const isOpen = !["fixed", "verified", "archived"].includes(issue.status);
  const isCritical = issue.severity === "critical";

  return (
    <div
      className={`rounded-lg border p-4 ${
        isCritical && isOpen
          ? "border-red-200 bg-red-50/50"
          : isRepeatingPattern
            ? "border-amber-200 bg-amber-50/30"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500">
        <span>{getRegressionCategoryLabel(issue.regressionCategory)}</span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            isCritical ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          {getRegressionSeverityLabel(issue.severity)}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            issue.status === "verified" || issue.status === "fixed"
              ? "bg-emerald-50 text-emerald-700"
              : issue.status === "detected" || issue.status === "investigating"
                ? "bg-amber-50 text-amber-700"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {getRegressionStatusLabel(issue.status)}
        </span>
        {isRepeatingPattern && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
            반복 패턴
          </span>
        )}
      </div>
      <p className="mt-2 font-medium text-gray-900">{issue.title}</p>
      {issue.description && (
        <p className="mt-1 line-clamp-2 text-[13px] text-gray-600">
          {issue.description}
        </p>
      )}
      <p className="mt-2 text-[12px] text-gray-500">
        감지 {new Date(issue.detectedAt).toLocaleString()}
        {issue.fixedAt && ` · 수정 ${new Date(issue.fixedAt).toLocaleString()}`}
        {issue.ownerAdminNickname && ` · ${issue.ownerAdminNickname}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1 text-[12px]">
        {issue.linkedQaIssueId && (
          <Link href="/admin/qa-board" className="text-signature hover:underline">
            QA
          </Link>
        )}
        {issue.linkedBacklogItemId && (
          <Link href="/admin/product-backlog" className="text-signature hover:underline">
            백로그
          </Link>
        )}
        {issue.linkedHotfixReleaseId && (
          <Link href="/admin/release-archive" className="text-signature hover:underline">
            핫픽스
          </Link>
        )}
      </div>
    </div>
  );
}
