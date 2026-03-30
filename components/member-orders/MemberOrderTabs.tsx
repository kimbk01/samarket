"use client";

import type { MemberOrderTab } from "@/lib/member-orders/types";

const TABS: { key: MemberOrderTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "active", label: "진행중" },
  { key: "done", label: "완료" },
  { key: "issue", label: "취소·환불" },
];

export function MemberOrderTabs({
  active,
  onChange,
  counts,
  variant = "default",
}: {
  active: MemberOrderTab;
  onChange: (t: MemberOrderTab) => void;
  counts: Record<MemberOrderTab, number>;
  /** `feed`: 페이스북/메타류 하단 강조선 탭 — 본문과 동일 폰트 스택 유지 */
  variant?: "default" | "feed";
}) {
  if (variant === "feed") {
    return (
      <div className="flex min-w-0">
        {TABS.map(({ key, label }) => {
          const on = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`min-w-0 flex-1 border-b-2 py-3 text-center text-[13px] font-semibold transition sm:text-[15px] ${
                on
                  ? "border-signature text-signature"
                  : "border-transparent text-[#65676B] hover:bg-[#F0F2F5]/80 dark:hover:bg-white/5"
              }`}
            >
              <span className="block truncate px-0.5">
                {label}
                <span
                  className={`ml-0.5 tabular-nums font-semibold ${on ? "text-signature/80" : "text-[#8A8D91]"}`}
                >
                  {counts[key]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

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
