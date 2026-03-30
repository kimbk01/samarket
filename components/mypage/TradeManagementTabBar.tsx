"use client";

import {
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";

export function TradeManagementTabBar<T extends string>({
  tabs,
  active,
  counts,
  onChange,
  tabBaseClassName = APP_TOP_MENU_ROW1_BASE,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  counts: Record<T, number>;
  onChange: (tab: T) => void;
  /** 기본: 둥근 pill. 구매 내역 등은 `APP_TOP_MENU_ROW1_BASE_RADIUS_4` */
  tabBaseClassName?: string;
}) {
  return (
    <div className="-mx-1 mb-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-1.5 px-1">
        {tabs.map(({ id, label }) => {
          const n = counts[id] ?? 0;
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`${tabBaseClassName} ${
                isActive ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE
              }`}
            >
              {label}
              <span className={isActive ? "ml-1 opacity-90" : "ml-1 text-gray-400"}>({n})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
