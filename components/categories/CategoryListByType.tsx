"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/types/category";
import { CATEGORY_TYPE_LABELS } from "@/lib/types/category";
import { APP_TOP_MENU_ROW1_BASE, APP_TOP_MENU_ROW1_INACTIVE } from "@/lib/ui/app-top-menu";

export type CategoryListVariant = "tabs" | "list" | "grid";

interface CategoryListByTypeProps {
  /** 타입별로 묶어서 표시 (비어 있으면 전체) */
  types?: Array<"trade" | "service" | "community" | "feature">;
  variant?: CategoryListVariant;
  /** 클릭 시 이동할 base path (예: /search?category=) */
  linkBase?: string;
  /** 링크에 slug 사용 */
  linkUseSlug?: boolean;
}

/**
 * 카테고리 정렬(sort_order) 적용, type에 따라 UI 다르게 렌더링
 */
export function CategoryListByType({
  types = ["trade", "service", "community", "feature"],
  variant = "list",
  linkBase,
  linkUseSlug = true,
}: CategoryListByTypeProps) {
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);

  useEffect(() => {
    getCategories({ activeOnly: true }).then(setCategories);
  }, []);

  const byType = types.reduce((acc, t) => {
    acc[t] = categories.filter((c) => c.type === t);
    return acc;
  }, {} as Record<string, CategoryWithSettings[]>);

  if (variant === "tabs") {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories
          .filter((c) => types.includes(c.type))
          .map((c) => (
            <Link
              key={c.id}
              href={linkBase ? `${linkBase}${linkUseSlug ? c.slug : c.id}` : "#"}
              className={`${APP_TOP_MENU_ROW1_BASE} ${APP_TOP_MENU_ROW1_INACTIVE} shadow-sm`}
            >
              {c.name}
            </Link>
          ))}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {categories
          .filter((c) => types.includes(c.type))
          .map((c) => (
            <Link
              key={c.id}
              href={linkBase ? `${linkBase}${linkUseSlug ? c.slug : c.id}` : "#"}
              className="flex flex-col items-center rounded-ui-rect bg-sam-surface p-3 shadow-sm"
            >
              <span className="text-[13px] font-medium text-sam-fg">{c.name}</span>
              <span className="mt-0.5 text-[11px] text-sam-muted">
                {CATEGORY_TYPE_LABELS[c.type]}
              </span>
            </Link>
          ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {types.map((type) => {
        const list = byType[type];
        if (list.length === 0) return null;
        return (
          <div key={type}>
            <h3 className="mb-2 text-[12px] font-medium uppercase text-sam-muted">
              {CATEGORY_TYPE_LABELS[type as keyof typeof CATEGORY_TYPE_LABELS]}
            </h3>
            <ul className="space-y-1">
              {list.map((c) => (
                <li key={c.id}>
                  <Link
                    href={linkBase ? `${linkBase}${linkUseSlug ? c.slug : c.id}` : "#"}
                    className="block rounded-ui-rect bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
