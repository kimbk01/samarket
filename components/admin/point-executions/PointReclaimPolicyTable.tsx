"use client";

import type { PointReclaimPolicy } from "@/lib/types/point-execution";
import {
  POINT_RECLAIM_TRIGGER_LABELS,
  POINT_RECLAIM_MODE_LABELS,
} from "@/lib/point-executions/point-execution-utils";

interface PointReclaimPolicyTableProps {
  policies: PointReclaimPolicy[];
}

export function PointReclaimPolicyTable({
  policies,
}: PointReclaimPolicyTableProps) {
  if (policies.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        회수 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[480px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              대상
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              발동 조건
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              회수 방식
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              비율
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 text-gray-900">
                {p.targetType === "post" ? "글" : "댓글"}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {POINT_RECLAIM_TRIGGER_LABELS[p.triggerType]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {POINT_RECLAIM_MODE_LABELS[p.reclaimMode]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {p.reclaimPercent}%
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {p.isActive ? "활성" : "비활성"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
