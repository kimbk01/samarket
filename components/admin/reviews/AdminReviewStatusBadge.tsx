"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ReviewStatus } from "@/lib/types/review";
import { REVIEW_STATUS_KEYS } from "@/components/admin/i18n/admin-review-label-keys";

const CLASSES: Record<ReviewStatus, string> = {
  visible: "bg-sam-success-soft text-sam-success",
  hidden: "bg-sam-surface-muted text-sam-fg",
  reported: "bg-sam-warning-soft text-sam-warning",
};

interface AdminReviewStatusBadgeProps {
  status: ReviewStatus;
  className?: string;
}

export function AdminReviewStatusBadge({
  status,
  className = "",
}: AdminReviewStatusBadgeProps) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${CLASSES[status]} ${className}`}
    >
      {t(REVIEW_STATUS_KEYS[status])}
    </span>
  );
}
