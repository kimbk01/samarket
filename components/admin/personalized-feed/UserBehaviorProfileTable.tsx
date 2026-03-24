"use client";

import type { UserBehaviorProfile } from "@/lib/types/personalized-feed";

interface UserBehaviorProfileTableProps {
  profiles: UserBehaviorProfile[];
}

export function UserBehaviorProfileTable({ profiles }: UserBehaviorProfileTableProps) {
  if (profiles.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        사용자 행동 프로필이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              선호 지역
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              관심 카테고리
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              최근 본
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              찜/채팅
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              갱신
            </th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr
              key={p.userId}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">{p.userId}</td>
              <td className="max-w-[140px] truncate px-3 py-2.5 text-gray-700">
                {[p.preferredRegion, p.preferredCity, p.preferredBarangay]
                  .filter(Boolean)
                  .join(" · ") || "-"}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                {p.favoriteCategories.slice(0, 3).join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {p.recentViewedProductIds.length}건 / {p.recentViewedCategories.slice(0, 2).join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                찜 {p.recentFavoritedProductIds.length} / 채팅 {p.recentChattedProductIds.length}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(p.updatedAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
