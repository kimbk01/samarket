"use client";

import type { OwnerOrderTab } from "@/lib/store-owner/types";

const TABS: { key: OwnerOrderTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "new", label: "신규" },
  { key: "active", label: "진행중" },
  { key: "done", label: "완료" },
  { key: "issue", label: "취소·문제" },
];

export function OwnerOrderTabs({
  active,
  onChange,
  counts,
}: {
  active: OwnerOrderTab;
  onChange: (t: OwnerOrderTab) => void;
  counts: Record<OwnerOrderTab, number>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map(({ key, label }) => {
        const on = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              on
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            {label}
            <span className={`ml-1 tabular-nums ${on ? "text-white/80" : "text-gray-400"}`}>
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
