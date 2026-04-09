"use client";

import type { UserBehaviorInsight } from "@/lib/types/recommendation";
import { getUserBehaviorInsights } from "@/lib/recommendation/mock-user-behavior-insight";

export function UserBehaviorInsightTable() {
  const insights = getUserBehaviorInsights();

  if (insights.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        사용자 행동 인사이트가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              선호 카테고리
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              선호 지역
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              조회/찜/채팅
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              최근 활동
            </th>
          </tr>
        </thead>
        <tbody>
          {insights.map((i) => (
            <tr
              key={i.userId}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">{i.userId}</td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                {i.topCategories.slice(0, 3).join(", ") || "-"}
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                {i.topRegions.slice(0, 2).join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                조회 {i.totalViews} / 찜 {i.totalFavorites} / 채팅 {i.totalChatsStarted}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(i.lastActiveAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
