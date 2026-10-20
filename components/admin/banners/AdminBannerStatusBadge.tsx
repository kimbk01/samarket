"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { BannerStatus } from "@/lib/types/admin-banner";
import { ADMIN_BANNER_STATUS_KEYS } from "./admin-banner-i18n";

const CLASSES: Record<BannerStatus, string> = {
  draft: "bg-sam-surface-muted text-sam-fg",
  active: "bg-sam-success-soft text-sam-success",
  paused: "bg-sam-warning-soft text-sam-warning",
  expired: "bg-sam-border-soft text-sam-muted",
  hidden: "bg-sam-danger-soft text-sam-danger",
};

interface AdminBannerStatusBadgeProps {
  status: BannerStatus;
  className?: string;
}

export function AdminBannerStatusBadge({ status, className = "" }: AdminBannerStatusBadgeProps) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${CLASSES[status]} ${className}`}
    >
      {t(ADMIN_BANNER_STATUS_KEYS[status])}
    </span>
  );
}
