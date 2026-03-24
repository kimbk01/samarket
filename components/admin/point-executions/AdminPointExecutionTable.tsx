"use client";

import Link from "next/link";
import type { PointRewardExecution } from "@/lib/types/point-execution";
import {
  POINT_REWARD_ACTION_LABELS,
  POINT_EXECUTION_STATUS_LABELS,
} from "@/lib/point-executions/point-execution-utils";
import { getBoardName } from "@/lib/point-policies/point-policy-utils";
import { USER_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";

interface AdminPointExecutionTableProps {
  executions: PointRewardExecution[];
}

const STATUS_CLASS: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-800",
  blocked: "bg-amber-100 text-amber-800",
  reversed: "bg-gray-200 text-gray-700",
};

export function AdminPointExecutionTable({
  executions,
}: AdminPointExecutionTableProps) {
  if (executions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        지급/차단 실행 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[800px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              ID
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              게시판
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              행동
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
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/point-executions/${e.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {e.id}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {getBoardName(e.boardKey)}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {POINT_REWARD_ACTION_LABELS[e.actionType]}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-gray-600">
                {e.targetType} {e.targetId}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {e.userNickname}
                <span className="ml-1 text-[12px] text-gray-500">
                  ({USER_TYPE_LABELS[e.userType]})
                </span>
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {e.status === "success" ? `+${e.finalPoint}P` : "-"}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    STATUS_CLASS[e.status] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {POINT_EXECUTION_STATUS_LABELS[e.status]}
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
