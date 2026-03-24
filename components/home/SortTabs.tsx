"use client";

import type { SortKey } from "@/lib/constants/sort";
import { SORT_OPTIONS } from "@/lib/constants/sort";
import {
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";

interface SortTabsProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
}

/** 동네생활 상단 섹션 탭과 동일 pill·타이포 */
export function SortTabs({ value, onChange }: SortTabsProps) {
  return (
    <div className="sticky top-24 z-10 flex flex-nowrap gap-1 overflow-x-auto border-b border-gray-100 bg-white px-2 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {SORT_OPTIONS.map((opt) => {
        const on = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`${APP_TOP_MENU_ROW1_BASE} ${on ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
