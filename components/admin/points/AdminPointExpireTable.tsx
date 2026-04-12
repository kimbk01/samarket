"use client";

import type { PointExpireExecution } from "@/lib/types/point-expire";
import { POINT_EXPIRE_EXECUTION_STATUS_LABELS } from "@/lib/points/point-expire-utils";

interface AdminPointExpireTableProps {
  executions: PointExpireExecution[];
}

const STATUS_CLASS: Record<string, string> = {
  simulated: "bg-sam-surface-muted text-sam-fg",
  success: "bg-emerald-50 text-emerald-800",
  skipped: "bg-amber-50 text-amber-800",
  failed: "bg-red-50 text-red-700",
};

export function AdminPointExpireTable({
  executions,
}: AdminPointExpireTableProps) {
  if (executions.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        만료 실행 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              실행일
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              대상 사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              만료 P
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              일시
            </th>
          </tr>
        </thead>
        <tbody>
          {executions.map((e) => (
            <tr
              key={e.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">{e.executionDate}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {e.targetUserNickname} ({e.targetUserId})
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                -{e.expiredPoint}P
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    STATUS_CLASS[e.executionStatus] ?? "bg-sam-surface-muted text-sam-fg"
                  }`}
                >
                  {POINT_EXPIRE_EXECUTION_STATUS_LABELS[e.executionStatus]}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(e.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
