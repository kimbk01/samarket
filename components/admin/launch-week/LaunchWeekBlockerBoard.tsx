"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import {
  getBlockedChecklistItems,
  getOpenCriticalIssues,
} from "@/lib/launch-week/launch-week-state";
import { getAreaLabel, getIssueStatusLabel, getPriorityLabel } from "@/lib/launch-week/launch-week-utils";
import Link from "next/link";

export function LaunchWeekBlockerBoard() {
  const blockedChecklist = useMemo(() => getBlockedChecklistItems(), []);
  const criticalIssues = useMemo(() => getOpenCriticalIssues(), []);

  const hasAny = blockedChecklist.length > 0 || criticalIssues.length > 0;

  if (!hasAny) {
    return (
      <AdminEmptyState ko message={"차단(blocked) 체크리스트 및 Critical 미해결 이슈가 없습니다."} />
    );
  }

  return (
    <div className="space-y-6">
      {blockedChecklist.length > 0 && (
        <div>
          <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
            차단 체크리스트
          </h3>
          <div className="space-y-3">
            {blockedChecklist.map((c) => (
              <div
                key={c.id}
                className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft p-4"
              >
                <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
                  <span>Day {c.dayNumber}</span>
                  <span>{getAreaLabel(c.area)}</span>
                  <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
                    {getPriorityLabel(c.priority)}
                  </span>
                </div>
                <p className="mt-2 font-medium text-sam-fg">{c.title}</p>
                <p className="mt-2 sam-text-body text-sam-danger">
                  {c.blockerReason}
                </p>
                {c.ownerAdminNickname && (
                  <p className="mt-2 sam-text-helper text-sam-muted">
                    담당 {c.ownerAdminNickname}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {criticalIssues.length > 0 && (
        <div>
          <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
            Critical 미해결 이슈
          </h3>
          <div className="space-y-3">
            {criticalIssues.map((i) => (
              <div
                key={i.id}
                className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft p-4"
              >
                <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
                  <span>Day {i.dayNumber}</span>
                  <span>{getAreaLabel(i.category)}</span>
                </div>
                <p className="mt-2 font-medium text-sam-fg">{i.title}</p>
                <p className="mt-2 sam-text-body text-sam-danger">{getIssueStatusLabel(i.status)}</p>
                {i.linkedType && i.linkedId && (
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    연결: {i.linkedType}{" "}
                    {i.linkedType === "qa_issue" && (
                      <Link
                        href="/admin/qa-board"
                        className="text-signature hover:underline"
                      >
                        {i.linkedId}
                      </Link>
                    )}
                    {i.linkedType !== "qa_issue" && i.linkedId}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
