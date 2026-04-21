"use client";

import { useMemo } from "react";
import { getQaSummary } from "@/lib/qa-board/mock-qa-summary";
import { getGoLiveQaLabel } from "@/lib/qa-board/qa-board-utils";
import Link from "next/link";

export function QaSummaryCards() {
  const summary = useMemo(() => getQaSummary(), []);

  const passRate =
    summary.totalCases > 0
      ? Math.round((summary.passedCases / summary.totalCases) * 100)
      : 0;

  const goClass =
    summary.goLiveQaDecision === "go"
      ? "text-emerald-700"
      : summary.goLiveQaDecision === "conditional_go"
        ? "text-amber-700"
        : "text-red-700";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">Pass Rate</p>
          <p className="sam-text-hero font-semibold text-sam-fg">
            {passRate}%
          </p>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">
            {summary.passedCases} / {summary.totalCases}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">실패 / 차단</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.failedCases} / {summary.blockedCases}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">Must-Pass</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.mustPassPassed} / {summary.mustPassTotal}
          </p>
          {summary.mustPassPassed < summary.mustPassTotal && (
            <p className="mt-1 sam-text-helper text-amber-600">미통과 있음</p>
          )}
        </div>
        <div
          className={`rounded-ui-rect border p-4 ${
            summary.goLiveQaDecision === "no_go"
              ? "border-red-200 bg-red-50/50"
              : summary.goLiveQaDecision === "conditional_go"
                ? "border-amber-200 bg-amber-50/50"
                : "border-emerald-200 bg-emerald-50/30"
          }`}
        >
          <p className="sam-text-helper text-sam-muted">Go-Live QA 판정</p>
          <p className={`sam-text-page-title font-semibold ${goClass}`}>
            {getGoLiveQaLabel(summary.goLiveQaDecision)}
          </p>
          {summary.criticalOpenIssues > 0 && (
            <p className="mt-1 sam-text-helper text-red-600">
              Critical 이슈 {summary.criticalOpenIssues}건
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">파일럿 운영</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.pilotDoneCount} / {summary.pilotTotalCount} 완료
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">연결</p>
          <p className="sam-text-body text-sam-fg">
            <Link href="/admin/launch-readiness" className="text-signature hover:underline">
              런칭 준비
            </Link>
            {" · "}
            <Link href="/admin/production-migration" className="text-signature hover:underline">
              프로덕션 전환
            </Link>
            {" · "}
            <Link href="/admin/ops-board" className="text-signature hover:underline">
              운영 보드
            </Link>
          </p>
        </div>
      </div>

      {summary.latestUpdatedAt && (
        <p className="sam-text-helper text-sam-muted">
          최종 갱신: {new Date(summary.latestUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
