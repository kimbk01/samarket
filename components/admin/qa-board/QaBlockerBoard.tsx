"use client";

import { useMemo } from "react";
import { getBlockedOrFailedTestCases } from "@/lib/qa-board/mock-qa-test-cases";
import { getQaTestSuiteById } from "@/lib/qa-board/mock-qa-test-suites";
import { getDomainLabel, getCaseStatusLabel } from "@/lib/qa-board/qa-board-utils";
import Link from "next/link";

export function QaBlockerBoard() {
  const blockedOrFailed = useMemo(() => getBlockedOrFailedTestCases(), []);

  if (blockedOrFailed.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
        차단(blocked) 또는 실패(failed) 테스트 케이스가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-sam-muted">
        Must-Pass 실패/차단은 Go-Live No-Go 사유가 됩니다.
      </p>
      <div className="space-y-3">
        {blockedOrFailed.map((c) => {
          const suite = getQaTestSuiteById(c.suiteId);
          const isMustPass = c.isMustPass;
          return (
            <div
              key={c.id}
              className={`rounded-ui-rect border p-4 ${
                c.status === "failed"
                  ? "border-red-200 bg-red-50/50"
                  : "border-amber-200 bg-amber-50/50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-sam-muted">
                {suite && <span>{getDomainLabel(suite.domain)}</span>}
                <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
                  {getCaseStatusLabel(c.status)}
                </span>
                {isMustPass && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">
                    Must-Pass
                  </span>
                )}
              </div>
              <p className="mt-2 font-medium text-sam-fg">{c.title}</p>
              <p className="mt-2 text-[14px] text-red-800">
                {c.failureNote || c.blockerReason}
              </p>
              {(c.ownerAdminNickname || c.executedAt) && (
                <p className="mt-2 text-[12px] text-sam-muted">
                  담당 {c.ownerAdminNickname ?? "-"}
                  {c.executedAt &&
                    ` · 실행 ${new Date(c.executedAt).toLocaleString()}`}
                </p>
              )}
              {c.linkedType && c.linkedId && (
                <p className="mt-1 text-[12px] text-sam-muted">
                  연결: {c.linkedType}{" "}
                  {c.linkedType === "readiness_item" && (
                    <Link
                      href="/admin/launch-readiness"
                      className="text-signature hover:underline"
                    >
                      {c.linkedId}
                    </Link>
                  )}
                  {c.linkedType !== "readiness_item" && c.linkedId}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
