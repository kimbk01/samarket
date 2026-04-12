"use client";

import type { AuditSummary, AuditLogCategory } from "@/lib/types/admin-audit";

const CATEGORY_LABELS: Record<AuditLogCategory, string> = {
  product: "상품",
  user: "회원",
  chat: "채팅",
  report: "신고",
  review: "리뷰",
  setting: "설정",
  auth: "관리자 인증",
};

interface AdminAuditSummaryCardsProps {
  summary: AuditSummary;
}

export function AdminAuditSummaryCards({ summary }: AdminAuditSummaryCardsProps) {
  const items = [
    { label: "오늘 로그", value: summary.todayCount },
    { label: "경고", value: summary.warningCount },
    { label: "오류", value: summary.errorCount },
    { label: "최다 활동 관리자", value: summary.topAdminNickname },
    { label: "최다 카테고리", value: CATEGORY_LABELS[summary.topCategory] },
    {
      label: "최근 활동",
      value: summary.latestActionAt
        ? new Date(summary.latestActionAt).toLocaleString("ko-KR")
        : "-",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        >
          <p className="text-[12px] text-sam-muted">{label}</p>
          <p className="mt-0.5 truncate text-[14px] font-medium text-sam-fg">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}
