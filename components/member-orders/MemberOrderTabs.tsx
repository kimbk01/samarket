"use client";

import type { MemberOrderTab } from "@/lib/member-orders/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

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
      <div className={Sam.tabs.bar}>
        {TABS.map(({ key, labelKey }) => {
          const on = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-selected={on}
              role="tab"
              className={on ? Sam.tabs.tabActive : Sam.tabs.tab}
            >
              <span className="block truncate px-0.5">
                {t(labelKey)}
                <span className={`ml-0.5 tabular-nums font-semibold ${on ? "text-sam-primary" : "text-sam-meta"}`}>
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
    <div className={`${Sam.tabs.barScroll} [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
      {TABS.map(({ key, labelKey }) => {
        const on = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-selected={on}
            role="tab"
            className={on ? Sam.tabs.tabActive : Sam.tabs.tab}
          >
            {t(labelKey)}
            <span className={`ml-1 tabular-nums ${on ? "text-sam-primary" : "text-sam-meta"}`}>
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
