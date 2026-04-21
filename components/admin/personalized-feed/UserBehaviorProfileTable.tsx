"use client";

import type { UserBehaviorProfile } from "@/lib/types/personalized-feed";

interface UserBehaviorProfileTableProps {
  profiles: UserBehaviorProfile[];
}

export function UserBehaviorProfileTable({ profiles }: UserBehaviorProfileTableProps) {
  if (profiles.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        사용자 행동 프로필이 없습니다.
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
              선호 지역
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              관심 카테고리
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              최근 본
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              찜/채팅
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              갱신
            </th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr
              key={p.userId}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">{p.userId}</td>
              <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-fg">
                {[p.preferredRegion, p.preferredCity, p.preferredBarangay]
                  .filter(Boolean)
                  .join(" · ") || "-"}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {p.favoriteCategories.slice(0, 3).join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {p.recentViewedProductIds.length}건 / {p.recentViewedCategories.slice(0, 2).join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                찜 {p.recentFavoritedProductIds.length} / 채팅 {p.recentChattedProductIds.length}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(p.updatedAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
