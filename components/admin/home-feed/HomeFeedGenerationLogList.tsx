"use client";

import type { HomeFeedGenerationLog } from "@/lib/types/home-feed";
import { SECTION_LABELS } from "@/lib/home-feed/mock-home-feed-policies";

interface HomeFeedGenerationLogListProps {
  logs: HomeFeedGenerationLog[];
}

export function HomeFeedGenerationLogList({ logs }: HomeFeedGenerationLogListProps) {
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
              사용자 지역
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              후보/결과/중복제거
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              광고 포함
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
                {new Date(log.generatedAt).toLocaleString("ko-KR")}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-gray-700">
                {log.userRegion}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {SECTION_LABELS[log.sectionKey]}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {log.candidateCount} → {log.finalCount} (중복제거 {log.dedupedCount})
              </td>
              <td className="px-3 py-2.5 text-gray-700">{log.sponsoredIncluded}</td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                {log.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
