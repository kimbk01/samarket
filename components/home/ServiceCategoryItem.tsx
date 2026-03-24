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
      className="flex min-w-[72px] shrink-0 flex-col items-center justify-center rounded-xl bg-gray-50 py-4 transition-colors hover:bg-gray-100"
    >
      <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm">
        <CategoryIcon iconKey={category.icon_key} />
      </span>
      <span className="text-center text-[13px] font-medium text-gray-800">{category.name}</span>
    </Link>
  );
}
