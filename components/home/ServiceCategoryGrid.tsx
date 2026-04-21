"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { ServiceCategoryItem } from "./ServiceCategoryItem";

interface ServiceCategoryGridProps {
  categories: CategoryWithSettings[];
  /** 최대 표시 개수 (0 = 전부) */
  maxItems?: number;
}

/**
 * DB 카테고리 기준 서비스 퀵 영역 (가로 스크롤, 첨부 UI 동일)
 */
export function ServiceCategoryGrid({ categories, maxItems = 12 }: ServiceCategoryGridProps) {
  const items = maxItems > 0 ? categories.slice(0, maxItems) : categories;

  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-8 text-center sam-text-body text-sam-muted shadow-sm">
        표시할 카테고리가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {items.map((c) => (
        <ServiceCategoryItem key={c.id} category={c} />
      ))}
    </div>
  );
}
