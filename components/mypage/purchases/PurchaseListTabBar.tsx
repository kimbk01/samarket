"use client";

import type { PurchaseListTabId } from "@/lib/mypage/purchase-list-tabs";
import { PURCHASE_LIST_TABS } from "@/lib/mypage/purchase-list-tabs";
import { MYPAGE_OVAL_TABS_SCROLL_CLASS, mypageOvalTabClass } from "@/lib/ui/mypage-oval-tabs";

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
    <div className={`${MYPAGE_OVAL_TABS_SCROLL_CLASS} mb-3`} data-mypage-tabs="oval">
      {PURCHASE_LIST_TABS.map(({ id, label }) => {
        const n = counts[id];
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={mypageOvalTabClass(isActive)}
          >
            {label}
            <span className={isActive ? "ml-1 opacity-90" : "ml-1 text-[#6F4E37]/80"}>({n})</span>
          </button>
        );
      })}
    </div>
  );
}
