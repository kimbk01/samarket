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
      className={`rounded-ui-rect border p-4 ${
        isCritical && isOpen
          ? "border-red-200 bg-red-50/50"
          : isRepeatingPattern
            ? "border-amber-200 bg-amber-50/30"
            : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 sam-text-helper text-sam-muted">
        <span>{getRegressionCategoryLabel(issue.regressionCategory)}</span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            isCritical ? "bg-red-100 text-red-800" : "bg-sam-surface-muted text-sam-muted"
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
                : "bg-sam-surface-muted text-sam-muted"
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
      <p className="mt-2 font-medium text-sam-fg">{issue.title}</p>
      {issue.description && (
        <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-muted">
          {issue.description}
        </p>
      )}
      <p className="mt-2 sam-text-helper text-sam-muted">
        감지 {new Date(issue.detectedAt).toLocaleString()}
        {issue.fixedAt && ` · 수정 ${new Date(issue.fixedAt).toLocaleString()}`}
        {issue.ownerAdminNickname && ` · ${issue.ownerAdminNickname}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1 sam-text-helper">
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
