"use client";

import type { PersonalizedFeedLog } from "@/lib/types/personalized-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/mock-personalized-feed-policies";

interface PersonalizedFeedLogListProps {
  logs: PersonalizedFeedLog[];
}

export function PersonalizedFeedLogList({ logs }: PersonalizedFeedLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        생성 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              생성일시
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              후보/결과/중복제거
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              대표 사유
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              비고
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-600">
                {new Date(log.createdAt).toLocaleString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-gray-700">{log.userId}</td>
              <td className="px-3 py-2.5 text-gray-700">
                {PERSONALIZED_SECTION_LABELS[log.sectionKey]}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {log.candidateCount} → {log.finalCount} (중복제거 {log.dedupedCount})
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                {log.topReason}
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                {log.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
