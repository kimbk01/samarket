"use client";

import { useMemo } from "react";
import { getAllRecentViewedProducts } from "@/lib/recommendation/mock-recent-viewed-products";

const SOURCE_LABELS: Record<string, string> = {
  home: "홈",
  search: "검색",
  chat: "채팅",
  recommendation: "추천",
  shop: "상점",
};

export function RecentViewedAdminTable() {
  const allRecords = useMemo(() => getAllRecentViewedProducts(200), []);

  if (allRecords.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        최근 본 상품 기록이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상품 ID
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              출처
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              조회 시각
            </th>
          </tr>
        </thead>
        <tbody>
          {allRecords.map((r) => (
            <tr
              key={r.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 text-gray-700">{r.userId}</td>
              <td className="px-3 py-2.5 font-medium text-gray-900">{r.productId}</td>
              <td className="px-3 py-2.5 text-gray-700">
                {SOURCE_LABELS[r.source] ?? r.source}
              </td>
              <td className="px-3 py-2.5 text-gray-600">{r.sectionKey ?? "-"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(r.viewedAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
