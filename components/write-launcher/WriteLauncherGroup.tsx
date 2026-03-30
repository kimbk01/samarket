"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { WriteLauncherItem } from "./WriteLauncherItem";

interface WriteLauncherGroupProps {
  groupKey: string;
  /** 섹션 제목 (예: 거래, 커뮤니티) */
  title?: string;
  categories: CategoryWithSettings[];
  onItemClick?: () => void;
}

export function WriteLauncherGroup({
  groupKey: _groupKey,
  title,
  categories,
  onItemClick,
}: WriteLauncherGroupProps) {
  if (categories.length === 0) return null;

  return (
    <div className="px-1">
      {title ? (
        <h3 className="px-4 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      ) : null}
      {categories.map((c) => (
        <WriteLauncherItem key={c.id} category={c} onNavigate={onItemClick} />
      ))}
    </div>
  );
}
