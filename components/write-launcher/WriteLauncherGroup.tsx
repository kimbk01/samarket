"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { WriteLauncherItem } from "./WriteLauncherItem";

interface WriteLauncherGroupProps {
  groupKey: string;
  categories: CategoryWithSettings[];
  onItemClick?: () => void;
}

export function WriteLauncherGroup({ groupKey: _groupKey, categories, onItemClick }: WriteLauncherGroupProps) {
  if (categories.length === 0) return null;

  return (
    <div className="px-1">
      {categories.map((c) => (
        <WriteLauncherItem key={c.id} category={c} onNavigate={onItemClick} />
      ))}
    </div>
  );
}
