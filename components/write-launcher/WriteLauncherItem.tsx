"use client";

import { useRouter } from "next/navigation";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryWriteHref } from "@/lib/categories/getCategoryHref";
import { CategoryIcon } from "@/components/home/CategoryIcon";

interface WriteLauncherItemProps {
  category: CategoryWithSettings;
  onNavigate?: () => void;
}

/**
 * 단색 원 + 라인 아이콘 (메타/인스타 설정·리스트류처럼 심플).
 * flex 수축으로 타원처럼 보이지 않도록 size 고정 + shrink-0 + aspect-square.
 */
export function WriteLauncherItem({ category, onNavigate }: WriteLauncherItemProps) {
  const router = useRouter();
  const href = getCategoryWriteHref(category);

  const handleClick = () => {
    onNavigate?.();
    requestAnimationFrame(() => {
      router.push(href);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-neutral-100/90"
    >
      <span
        className="box-border flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-700 aspect-square"
        aria-hidden
      >
        <CategoryIcon iconKey={category.icon_key} className="size-[22px] text-current" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-medium text-neutral-900">{category.name}</span>
    </button>
  );
}
