"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_OVAL_TABS_SCROLL_CLASS, mypageOvalTabClass } from "@/lib/ui/mypage-oval-tabs";

export function TradeManagementTabBar<T extends string>({
  tabs,
  active,
  counts,
  onChange,
}: {
  tabs: readonly { id: T; label: string; labelKey?: MessageKey }[];
  active: T;
  counts: Record<T, number>;
  onChange: (tab: T) => void;
  /** @deprecated ignored — oval tabs are the SSOT for trade manage bars */
  tabBaseClassName?: string;
}) {
  const { t, tt } = useI18n();
  return (
    <div className={`${MYPAGE_OVAL_TABS_SCROLL_CLASS} mb-3`} data-mypage-tabs="oval">
      {tabs.map(({ id, label, labelKey }) => {
        const n = counts[id] ?? 0;
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={mypageOvalTabClass(isActive)}
          >
            {labelKey ? t(labelKey) : tt(label)}
            <span className={isActive ? "ml-1 opacity-90" : "ml-1 text-[#6F4E37]/80"}>({n})</span>
          </button>
        );
      })}
    </div>
  );
}
