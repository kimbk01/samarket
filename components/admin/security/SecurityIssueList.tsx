"use client";

import { useMemo, useState } from "react";
import { getSecurityIssues } from "@/lib/security/mock-security-issues";
import { getSecurityCheckById } from "@/lib/security/mock-security-checks";
import {
  getIssueSeverityLabel,
  getIssueStatusLabel,
  getCheckTypeLabel,
} from "@/lib/security/security-utils";
import type { SecurityIssueStatus } from "@/lib/types/security";

export function SecurityIssueList() {
  const [statusFilter, setStatusFilter] = useState<SecurityIssueStatus | "">("");
  const issues = useMemo(
    () =>
      getSecurityIssues(
        statusFilter ? { status: statusFilter } : undefined
      ),
    [statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">이슈 상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as SecurityIssueStatus | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="open">미해결</option>
          <option value="fixed">해결됨</option>
        </select>
      </div>

      {issues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 조건의 보안 이슈가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {issues.map((i) => {
            const check = getSecurityCheckById(i.checkId);
            return (
              <li
                key={i.id}
                className={`rounded-lg border p-4 ${
                  i.severity === "critical" && i.status === "open"
                    ? "border-red-200 bg-red-50/30"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
                  <span>
                    {check ? getCheckTypeLabel(check.checkType) : i.checkId}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      i.severity === "critical"
                        ? "bg-red-100 text-red-800"
                        : i.severity === "high"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {getIssueSeverityLabel(i.severity)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      i.status === "fixed"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {getIssueStatusLabel(i.status)}
                  </span>
                </div>
                <p className="mt-2 font-medium text-gray-900">{i.issueTitle}</p>
                {i.note && (
                  <p className="mt-1 text-[13px] text-gray-600">{i.note}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
