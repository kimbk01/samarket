"use client";

import { useMemo } from "react";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { getRecentViewedProducts } from "@/lib/recommendation/mock-recent-viewed-products";
import { RecentViewedCard } from "./RecentViewedCard";

export function RecentViewedList() {
  const userId = getCurrentUserId();
  const records = useMemo(
    () => getRecentViewedProducts(userId, 50),
    [userId]
  );

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="sam-text-body text-sam-muted">최근 본 상품이 없어요</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {records.map((r) => (
        <li key={r.id}>
          <RecentViewedCard record={r} />
        </li>
      ))}
    </ul>
  );
}
