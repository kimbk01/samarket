"use client";

import type { ExposurePolicyLog } from "@/lib/types/exposure";
import { SURFACE_LABELS } from "@/lib/exposure/exposure-score-utils";

const ACTION_LABELS: Record<string, string> = {
  create: "생성",
  update: "수정",
  activate: "활성화",
  deactivate: "비활성화",
  simulate: "시뮬레이션",
};

interface ExposurePolicyLogListProps {
  logs: ExposurePolicyLog[];
}

export function ExposurePolicyLogList({ logs }: ExposurePolicyLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        변경 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[480px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              정책 ID
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              액션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              관리자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              비고
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              일시
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr
              key={l.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 text-gray-900">{l.policyId}</td>
              <td className="px-3 py-2.5 text-gray-700">
                {SURFACE_LABELS[l.surface]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {ACTION_LABELS[l.actionType] ?? l.actionType}
              </td>
              <td className="px-3 py-2.5 text-gray-600">{l.adminNickname}</td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-gray-600">
                {l.note}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(l.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
