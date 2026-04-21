"use client";

import type { UserActivitySummary } from "@/lib/types/admin-user";
import { AdminCard } from "@/components/admin/AdminCard";

interface AdminUserSummaryCardsProps {
  summary: UserActivitySummary;
}

export function AdminUserSummaryCards({ summary }: AdminUserSummaryCardsProps) {
  const items = [
    { label: "등록 상품", value: summary.activeProducts },
    { label: "판매 완료", value: summary.soldProducts },
    { label: "찜 수", value: summary.favoriteCount },
    { label: "후기 수", value: summary.reviewCount },
    { label: "평균 평점", value: summary.averageRating ? summary.averageRating.toFixed(1) : "-" },
    { label: "신고 수", value: summary.reportCount },
    { label: "차단 관련", value: summary.blockedCount },
    { label: "채팅방", value: summary.chatRoomCount },
  ];

  return (
    <AdminCard title="활동 요약">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(({ label, value }) => (
          <div key={label} className="rounded border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper text-sam-muted">{label}</p>
            <p className="mt-0.5 sam-text-body font-medium text-sam-fg">{value}</p>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
