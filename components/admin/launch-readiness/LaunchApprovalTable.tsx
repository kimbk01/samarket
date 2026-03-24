"use client";

import { useMemo, useState } from "react";
import { getLaunchApprovals } from "@/lib/launch-readiness/mock-launch-approvals";
import { AdminTable } from "@/components/admin/AdminTable";
import { getPhaseLabel } from "@/lib/launch-readiness/launch-readiness-utils";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";

const ROLE_LABELS: Record<string, string> = {
  product_owner: "PO",
  ops_owner: "운영",
  tech_owner: "기술",
  admin: "관리자",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "승인",
  conditional: "조건부",
  rejected: "반려",
};

export function LaunchApprovalTable() {
  const [phase, setPhase] = useState<LaunchReadinessPhase | "">("");
  const approvals = useMemo(
    () => getLaunchApprovals(phase ? { phase } : undefined),
    [phase]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">단계</span>
        <select
          value={phase}
          onChange={(e) =>
            setPhase((e.target.value || "") as LaunchReadinessPhase | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="pre_launch">Pre-Launch</option>
          <option value="launch_day">Launch Day</option>
          <option value="post_launch">Post-Launch</option>
        </select>
      </div>

      <p className="text-[12px] text-gray-500">
        승인자(approver) placeholder: approverAdminId / approverAdminNickname
        입력 시 표시됩니다.
      </p>

      {approvals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 단계 승인 내역이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={["단계", "역할", "승인자", "결정", "메모", "일시"]}
        >
          {approvals.map((a) => (
            <tr key={a.id} className="border-b border-gray-100">
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getPhaseLabel(a.phase)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {ROLE_LABELS[a.approverRole] ?? a.approverRole}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {a.approverAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    a.decision === "approved"
                      ? "bg-emerald-100 text-emerald-800"
                      : a.decision === "rejected"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {DECISION_LABELS[a.decision] ?? a.decision}
                </span>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                {a.note || "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(a.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
