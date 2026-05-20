"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface CategoryStatusBadgeProps {
  isActive: boolean;
}

export function CategoryStatusBadge({ isActive }: CategoryStatusBadgeProps) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 sam-text-helper font-medium ${
        isActive ? "bg-green-100 text-green-800" : "bg-sam-border-soft text-sam-muted"
      }`}
    >
      {isActive ? t("admin_cat_status_active") : t("admin_cat_status_inactive")}
    </span>
  );
}
