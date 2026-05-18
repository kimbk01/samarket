"use client";

import type { CategoryType } from "@/lib/categories/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminCategoryTypeLabelKey } from "@/lib/admin/categories/admin-category-label-keys";

interface CategoryTypeBadgeProps {
  type: CategoryType;
}

export function CategoryTypeBadge({ type }: CategoryTypeBadgeProps) {
  const { t } = useI18n();
  const label = t(adminCategoryTypeLabelKey(type));
  const color =
    type === "trade"
      ? "bg-green-100 text-green-800"
      : type === "community"
        ? "bg-blue-100 text-blue-800"
        : type === "service"
          ? "bg-amber-100 text-amber-800"
          : "bg-sam-surface-muted text-sam-fg";

  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 sam-text-helper font-medium ${color}`}>
      {label}
    </span>
  );
}
