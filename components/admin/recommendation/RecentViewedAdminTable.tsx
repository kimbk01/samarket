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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        최근 본 상품 기록이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상품 ID
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              출처
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              조회 시각
            </th>
          </tr>
        </thead>
        <tbody>
          {allRecords.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">{r.userId}</td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">{r.productId}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SOURCE_LABELS[r.source] ?? r.source}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">{r.sectionKey ?? "-"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(r.viewedAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
