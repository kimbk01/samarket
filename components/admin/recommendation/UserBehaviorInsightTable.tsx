"use client";

import type { UserBehaviorInsight } from "@/lib/types/recommendation";
import { getUserBehaviorInsights } from "@/lib/recommendation/mock-user-behavior-insight";

export function UserBehaviorInsightTable() {
  const insights = getUserBehaviorInsights();

  if (insights.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        사용자 행동 인사이트가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              선호 카테고리
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              선호 지역
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              조회/찜/채팅
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              최근 활동
            </th>
          </tr>
        </thead>
        <tbody>
          {insights.map((i) => (
            <tr
              key={i.userId}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">{i.userId}</td>
              <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.topCategories.slice(0, 3).join(", ") || "-"}
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.topRegions.slice(0, 2).join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                조회 {i.totalViews} / 찜 {i.totalFavorites} / 채팅 {i.totalChatsStarted}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(i.lastActiveAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
