"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  tabs: readonly { id: T; label: string; labelKey?: MessageKey }[];
  active: T;
  counts: Record<T, number>;
  onChange: (tab: T) => void;
  /** 전역 underline 탭 클래스 */
  tabBaseClassName?: string;
}) {
  const { t, tt } = useI18n();
  return (
    <div className="sam-tabs sam-tabs--scroll mb-3">
        {tabs.map(({ id, label, labelKey }) => {
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
              {labelKey ? t(labelKey) : tt(label)}
              <span className={isActive ? "ml-1 opacity-90" : "ml-1 text-sam-meta"}>({n})</span>
            </button>
          );
        })}
    </div>
  );
}
