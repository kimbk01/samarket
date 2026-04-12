"use client";

import type { PurchaseListTabId } from "@/lib/mypage/purchase-list-tabs";
import { PURCHASE_LIST_TABS } from "@/lib/mypage/purchase-list-tabs";
import {
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";

export function PurchaseListTabBar({
  active,
  counts,
  onChange,
}: {
  active: PurchaseListTabId;
  counts: Record<PurchaseListTabId, number>;
  onChange: (tab: PurchaseListTabId) => void;
}) {
  return (
    <div className="-mx-1 mb-3 overflow-x-auto pb-1">
      <div className="flex min-w-max gap-1.5 px-1">
        {PURCHASE_LIST_TABS.map(({ id, label }) => {
          const n = counts[id];
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`${APP_TOP_MENU_ROW1_BASE} ${
                isActive ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE
              }`}
            >
              {label}
              <span className={isActive ? "ml-1 opacity-90" : "ml-1 text-sam-meta"}>({n})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
