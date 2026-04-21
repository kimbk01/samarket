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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        변경 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              정책 ID
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              액션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              관리자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              비고
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              일시
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr
              key={l.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">{l.policyId}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SURFACE_LABELS[l.surface]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {ACTION_LABELS[l.actionType] ?? l.actionType}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">{l.adminNickname}</td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-sam-muted">
                {l.note}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(l.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
