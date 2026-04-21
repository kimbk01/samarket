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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        회수 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              대상
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              발동 조건
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              회수 방식
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              비율
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">
                {p.targetType === "post" ? "글" : "댓글"}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {POINT_RECLAIM_TRIGGER_LABELS[p.triggerType]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {POINT_RECLAIM_MODE_LABELS[p.reclaimMode]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.reclaimPercent}%
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-sam-border-soft text-sam-muted"
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
