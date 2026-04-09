"use client";

import type { PointExpireExecution } from "@/lib/types/point-expire";
import { POINT_EXPIRE_EXECUTION_STATUS_LABELS } from "@/lib/points/point-expire-utils";

interface AdminPointExpireTableProps {
  executions: PointExpireExecution[];
}

const STATUS_CLASS: Record<string, string> = {
  simulated: "bg-gray-100 text-gray-700",
  success: "bg-emerald-50 text-emerald-800",
  skipped: "bg-amber-50 text-amber-800",
  failed: "bg-red-50 text-red-700",
};

export function AdminPointExpireTable({
  executions,
}: AdminPointExpireTableProps) {
  if (executions.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        만료 실행 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              실행일
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              대상 사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              만료 P
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              일시
            </th>
          </tr>
        </thead>
        <tbody>
          {executions.map((e) => (
            <tr
              key={e.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 text-gray-700">{e.executionDate}</td>
              <td className="px-3 py-2.5 text-gray-900">
                {e.targetUserNickname} ({e.targetUserId})
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                -{e.expiredPoint}P
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    STATUS_CLASS[e.executionStatus] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {POINT_EXPIRE_EXECUTION_STATUS_LABELS[e.executionStatus]}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(e.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
