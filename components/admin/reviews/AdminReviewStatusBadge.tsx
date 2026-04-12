"use client";

import type { ReviewStatus } from "@/lib/types/review";

const LABELS: Record<ReviewStatus, string> = {
  visible: "표시",
  hidden: "숨김",
  reported: "신고됨",
};

const CLASSES: Record<ReviewStatus, string> = {
  visible: "bg-emerald-50 text-emerald-800",
  hidden: "bg-sam-surface-muted text-sam-fg",
  reported: "bg-amber-100 text-amber-800",
};

interface AdminReviewStatusBadgeProps {
  status: ReviewStatus;
  className?: string;
}

export function AdminReviewStatusBadge({
  status,
  className = "",
}: AdminReviewStatusBadgeProps) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${CLASSES[status]} ${className}`}
    >
      {LABELS[status]}
    </span>
  );
}
