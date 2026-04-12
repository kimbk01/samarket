"use client";

import type { MemberOrderTab } from "@/lib/member-orders/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const TABS: { key: MemberOrderTab; labelKey: "common_all" | "common_in_progress" | "common_done" | "common_cancel_refund" }[] = [
  { key: "all", labelKey: "common_all" },
  { key: "active", labelKey: "common_in_progress" },
  { key: "done", labelKey: "common_done" },
  { key: "issue", labelKey: "common_cancel_refund" },
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
  const { t } = useI18n();
  if (variant === "feed") {
    return (
      <div className="flex min-w-0">
        {TABS.map(({ key, labelKey }) => {
          const on = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`min-w-0 flex-1 border-b-2 py-2.5 text-center text-[13px] font-semibold transition sm:py-3 sm:text-sm ${
                on
                  ? "border-signature text-signature"
                  : "border-transparent text-[#65676B] hover:bg-[#F0F2F5]/80 dark:hover:bg-sam-surface/5"
              }`}
            >
              <span className="block truncate px-0.5">
                {t(labelKey)}
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
      {TABS.map(({ key, labelKey }) => {
        const on = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              on
                ? "bg-sam-ink text-white shadow-sm"
                : "bg-sam-surface text-sam-fg ring-1 ring-sam-border hover:bg-sam-app"
            }`}
          >
            {t(labelKey)}
            <span className={`ml-1 tabular-nums ${on ? "text-white/80" : "text-sam-meta"}`}>
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
