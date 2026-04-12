"use client";

import type { CategoryType } from "@/lib/categories/types";
import { CATEGORY_TYPE_LABELS } from "@/lib/types/category";

interface CategoryTypeBadgeProps {
  type: CategoryType;
}

export function CategoryTypeBadge({ type }: CategoryTypeBadgeProps) {
  const label = CATEGORY_TYPE_LABELS[type] ?? type;
  const color =
    type === "trade"
      ? "bg-green-100 text-green-800"
      : type === "community"
        ? "bg-blue-100 text-blue-800"
        : type === "service"
          ? "bg-amber-100 text-amber-800"
          : "bg-sam-surface-muted text-sam-fg";

  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[12px] font-medium ${color}`}>
      {label}
    </span>
  );
}
