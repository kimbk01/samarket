"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { BannerStatus } from "@/lib/types/admin-banner";

const LABELS: Record<BannerStatus, string> = {
  draft: "초안",
  active: "활성",
  paused: "일시중지",
  expired: "만료",
  hidden: "숨김",
};

const CLASSES: Record<BannerStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-emerald-50 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  expired: "bg-gray-200 text-gray-600",
  hidden: "bg-red-50 text-red-700",
};

interface AdminBannerStatusBadgeProps {
  status: BannerStatus;
  className?: string;
}

export function AdminBannerStatusBadge({ status, className = "" }: AdminBannerStatusBadgeProps) {
  const { tt } = useI18n();
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${CLASSES[status]} ${className}`}
    >
      {tt(LABELS[status])}
    </span>
  );
}
