"use client";

import type { PointExpireLog } from "@/lib/types/point-expire";
import { POINT_EXPIRE_LOG_ACTION_LABELS } from "@/lib/points/point-expire-utils";

interface AdminPointExpireLogListProps {
  logs: PointExpireLog[];
}

export function AdminPointExpireLogList({ logs }: AdminPointExpireLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        만료 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              유형
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              만료 P
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              만료일
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
              <td className="px-3 py-2.5 text-sam-fg">
                {POINT_EXPIRE_LOG_ACTION_LABELS[l.actionType]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {l.userNickname} ({l.userId})
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                -{l.expiredPoint}P
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(l.expiresAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(l.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
