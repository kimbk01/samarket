"use client";

import { useRouter } from "next/navigation";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryWriteHref } from "@/lib/categories/getCategoryHref";
import { CategoryIcon } from "@/components/home/CategoryIcon";

/** 참고 이미지와 동일: 타입별 아이콘 배경색 */
const ICON_BG: Record<string, string> = {
  trade: "bg-orange-100 text-orange-600",
  service: "bg-violet-100 text-violet-600",
  community: "bg-sky-100 text-sky-600",
  feature: "bg-rose-100 text-rose-600",
};

function getIconBg(type: string): string {
  return ICON_BG[type] ?? "bg-gray-100 text-gray-600";
}

interface WriteLauncherItemProps {
  category: CategoryWithSettings;
  onNavigate?: () => void;
}

export function WriteLauncherItem({ category, onNavigate }: WriteLauncherItemProps) {
  const router = useRouter();
  const href = getCategoryWriteHref(category);
  const iconBg = getIconBg(category.type);

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
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-gray-50"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}
      >
        <CategoryIcon iconKey={category.icon_key} />
      </span>
      <span className="text-[15px] font-medium text-gray-900">{category.name}</span>
    </button>
  );
}
