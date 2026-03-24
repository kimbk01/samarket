"use client";

import type { PointPolicyLog } from "@/lib/types/point-policy";

const POLICY_TYPE_LABELS: Record<PointPolicyLog["policyType"], string> = {
  board_policy: "게시판 정책",
  probability_rule: "확률 구간",
  event_policy: "이벤트 정책",
};

const ACTION_LABELS: Record<PointPolicyLog["actionType"], string> = {
  create: "생성",
  update: "수정",
  activate: "활성화",
  deactivate: "비활성화",
  simulate: "시뮬레이션",
};

interface PointPolicyLogListProps {
  logs: PointPolicyLog[];
}

export function PointPolicyLogList({ logs }: PointPolicyLogListProps) {
  if (logs.length === 0) {
    return (
      <p className="text-[14px] text-gray-500">변경 이력이 없습니다.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-baseline gap-2 border-b border-gray-100 pb-2 text-[13px] last:border-0"
        >
          <span className="font-medium text-gray-700">
            {POLICY_TYPE_LABELS[log.policyType]}
          </span>
          <span className="text-gray-500">
            {ACTION_LABELS[log.actionType]}
          </span>
          <span className="text-gray-500">{log.note}</span>
          <span className="text-gray-500">{log.adminNickname}</span>
          <span className="ml-auto text-gray-400">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
