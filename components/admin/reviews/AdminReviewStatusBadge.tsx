"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ReviewStatus } from "@/lib/types/review";
import { REVIEW_STATUS_KEYS } from "@/components/admin/i18n/admin-review-label-keys";

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
  const { t } = useI18n();
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${CLASSES[status]} ${className}`}
    >
      {t(REVIEW_STATUS_KEYS[status])}
    </span>
  );
}
