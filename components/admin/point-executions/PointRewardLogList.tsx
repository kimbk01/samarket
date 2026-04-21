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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        지급/회수 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              유형
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              게시판
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              대상
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              포인트
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              잔액
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
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    l.actionType === "reward"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {POINT_REWARD_LOG_ACTION_LABELS[l.actionType]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {getBoardName(l.boardKey)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">
                {l.targetType} {l.targetId}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{l.userId}</td>
              <td
                className={`px-3 py-2.5 font-medium ${
                  l.pointAmount >= 0 ? "text-emerald-600" : "text-amber-700"
                }`}
              >
                {l.pointAmount >= 0 ? "+" : ""}
                {l.pointAmount}P
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {l.balanceAfter}P
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
