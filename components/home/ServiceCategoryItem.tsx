"use client";

import Link from "next/link";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { CategoryIcon } from "./CategoryIcon";

interface ServiceCategoryItemProps {
  category: CategoryWithSettings;
}

export function ServiceCategoryItem({ category }: ServiceCategoryItemProps) {
  const href = getCategoryHref(category);
  return (
    <Link
      href={href}
      className="flex min-w-[72px] shrink-0 flex-col items-center justify-center rounded-ui-rect bg-sam-app py-4 transition-colors hover:bg-sam-surface-muted"
    >
      <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-sam-surface text-sam-muted shadow-sm">
        <CategoryIcon iconKey={category.icon_key} />
      </span>
      <span className="text-center sam-text-body-secondary font-medium text-sam-fg">{category.name}</span>
    </Link>
  );
}
