"use client";

import { useMemo } from "react";
import { getBlockedChecklistItems } from "@/lib/launch-week/mock-launch-week-checklist-items";
import { getOpenCriticalIssues } from "@/lib/launch-week/mock-launch-week-issues";
import { getAreaLabel, getPriorityLabel } from "@/lib/launch-week/launch-week-utils";
import Link from "next/link";

export function LaunchWeekBlockerBoard() {
  const blockedChecklist = useMemo(() => getBlockedChecklistItems(), []);
  const criticalIssues = useMemo(() => getOpenCriticalIssues(), []);

  const hasAny = blockedChecklist.length > 0 || criticalIssues.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
        차단(blocked) 체크리스트 및 Critical 미해결 이슈가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {blockedChecklist.length > 0 && (
        <div>
          <h3 className="mb-2 text-[14px] font-medium text-gray-800">
            차단 체크리스트
          </h3>
          <div className="space-y-3">
            {blockedChecklist.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-red-200 bg-red-50/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
                  <span>Day {c.dayNumber}</span>
                  <span>{getAreaLabel(c.area)}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5">
                    {getPriorityLabel(c.priority)}
                  </span>
                </div>
                <p className="mt-2 font-medium text-gray-900">{c.title}</p>
                <p className="mt-2 text-[14px] text-red-800">
                  {c.blockerReason}
                </p>
                {c.ownerAdminNickname && (
                  <p className="mt-2 text-[12px] text-gray-500">
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
          <h3 className="mb-2 text-[14px] font-medium text-gray-800">
            Critical 미해결 이슈
          </h3>
          <div className="space-y-3">
            {criticalIssues.map((i) => (
              <div
                key={i.id}
                className="rounded-lg border border-red-200 bg-red-50/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
                  <span>Day {i.dayNumber}</span>
                  <span>{getAreaLabel(i.category)}</span>
                </div>
                <p className="mt-2 font-medium text-gray-900">{i.title}</p>
                <p className="mt-2 text-[14px] text-red-800">{i.status}</p>
                {i.linkedType && i.linkedId && (
                  <p className="mt-1 text-[12px] text-gray-500">
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
