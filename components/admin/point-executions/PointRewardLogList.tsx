"use client";

import type { PointRewardLog } from "@/lib/types/point-execution";
import { POINT_REWARD_LOG_ACTION_LABELS } from "@/lib/point-executions/point-execution-utils";
import { getBoardName } from "@/lib/point-policies/point-policy-utils";

interface PointRewardLogListProps {
  logs: PointRewardLog[];
}

export function PointRewardLogList({ logs }: PointRewardLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        지급/회수 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              유형
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              게시판
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              대상
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              포인트
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              잔액
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
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    l.actionType === "reward"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {POINT_REWARD_LOG_ACTION_LABELS[l.actionType]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {getBoardName(l.boardKey)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-gray-600">
                {l.targetType} {l.targetId}
              </td>
              <td className="px-3 py-2.5 text-gray-700">{l.userId}</td>
              <td
                className={`px-3 py-2.5 font-medium ${
                  l.pointAmount >= 0 ? "text-emerald-600" : "text-amber-700"
                }`}
              >
                {l.pointAmount >= 0 ? "+" : ""}
                {l.pointAmount}P
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {l.balanceAfter}P
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
