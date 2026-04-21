"use client";

import { memo } from "react";
import type { DashboardStats } from "@/lib/types/admin-dashboard";

interface AdminKpiCardsProps {
  stats: DashboardStats;
  /** true이면 숫자 대신 스켈레톤 (mock KPI와 구분) */
  loading?: boolean;
}

const CARDS: { key: keyof DashboardStats; label: string }[] = [
  { key: "totalUsers", label: "총 회원 수" },
  { key: "activeProducts", label: "활성 상품 수" },
  { key: "totalFavorites", label: "총 찜(관심) 건수" },
  { key: "newProductsToday", label: "오늘 신규 상품" },
  { key: "newUsersToday", label: "오늘 신규 회원" },
  { key: "pendingReports", label: "진행중 신고" },
  { key: "chatsToday", label: "오늘 채팅" },
  { key: "completedTransactions", label: "거래완료" },
  { key: "averageTrustScore", label: "평균 배터리" },
];

export const AdminKpiCards = memo(function AdminKpiCards({ stats, loading }: AdminKpiCardsProps) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-busy={loading ? true : undefined}
    >
      {CARDS.map(({ key, label }) => {
        const value = stats[key];
        const display =
          typeof value === "number" && key === "averageTrustScore"
            ? value.toFixed(1)
            : String(value);
        return (
          <div
            key={key}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
          >
            <p className="sam-text-helper text-sam-muted">{label}</p>
            <p className="mt-1 sam-text-page-title font-semibold text-sam-fg">
              {loading ? (
                <span
                  className="inline-block h-[1.125rem] w-[3.5rem] animate-pulse rounded bg-sam-border"
                  aria-hidden
                />
              ) : (
                display
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
});

AdminKpiCards.displayName = "AdminKpiCards";
