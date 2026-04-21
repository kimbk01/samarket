"use client";

import type { PersonalizedFeedLog } from "@/lib/types/personalized-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/mock-personalized-feed-policies";

interface PersonalizedFeedLogListProps {
  logs: PersonalizedFeedLog[];
}

export function PersonalizedFeedLogList({ logs }: PersonalizedFeedLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        생성 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              생성일시
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              후보/결과/중복제거
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              대표 사유
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
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(log.createdAt).toLocaleString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{log.userId}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {PERSONALIZED_SECTION_LABELS[log.sectionKey]}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {log.candidateCount} → {log.finalCount} (중복제거 {log.dedupedCount})
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {log.topReason}
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {log.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
