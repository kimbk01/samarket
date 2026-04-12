"use client";

import type { HomeFeedGenerationLog } from "@/lib/types/home-feed";
import { SECTION_LABELS } from "@/lib/home-feed/mock-home-feed-policies";

interface HomeFeedGenerationLogListProps {
  logs: HomeFeedGenerationLog[];
}

export function HomeFeedGenerationLogList({ logs }: HomeFeedGenerationLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        생성 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              생성일시
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용자 지역
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              후보/결과/중복제거
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              광고 포함
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              비고
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(log.generatedAt).toLocaleString("ko-KR")}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-sam-fg">
                {log.userRegion}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SECTION_LABELS[log.sectionKey]}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {log.candidateCount} → {log.finalCount} (중복제거 {log.dedupedCount})
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{log.sponsoredIncluded}</td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-[13px] text-sam-muted">
                {log.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
