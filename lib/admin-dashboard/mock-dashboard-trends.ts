/**
 * 19단계: 대시보드 추이 mock (차트용)
 */

import type { DashboardTrendItem } from "@/lib/types/admin-dashboard";

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** 최근 7일 일별 더미 (실제 연동 시 집계 쿼리로 교체) */
export function getDashboardTrend(days = 7): DashboardTrendItem[] {
  const items: DashboardTrendItem[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgo(i);
    items.push({
      date,
      newUsers: i === 0 ? 1 : 0,
      newProducts: i <= 2 ? 2 - i : 0,
      reports: i === 1 ? 2 : i === 0 ? 1 : 0,
      completedTransactions: i % 2 === 0 ? 1 : 0,
    });
  }
  return items;
}
