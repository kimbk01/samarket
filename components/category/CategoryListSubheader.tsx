"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { CATEGORY_TYPE_LABELS } from "@/lib/types/category";
import { CategoryIcon } from "@/components/home/CategoryIcon";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

/** 카테고리 목록: 2번째 줄 — 뒤로가기 + 제목을 한 행으로 통일 */
export function CategoryListSubheader({
  backHref,
  category,
  showTypeBadge = true,
}: {
  backHref?: string;
  category: CategoryWithSettings | null;
  showTypeBadge?: boolean;
}) {
  return (
    <div className="min-w-0 overflow-x-hidden border-t border-gray-100 bg-white py-2.5">
      <div className={`flex min-h-[52px] min-w-0 items-center gap-3 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}>
      <AppBackButton backHref={backHref} />
      {category ? (
        <>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
            <CategoryIcon iconKey={category.icon_key} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-semibold leading-snug text-gray-900">{category.name}</h1>
            {showTypeBadge && (
              <span className="mt-0.5 inline-block text-[12px] text-gray-500">
                {CATEGORY_TYPE_LABELS[category.type]}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-[14px] text-gray-500">불러오는 중…</p>
      )}
      </div>
    </div>
  );
}
