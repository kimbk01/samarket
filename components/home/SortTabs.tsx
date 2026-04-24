"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
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

/** 전역 underline 탭 규격 */
export function SortTabs({ value, onChange }: SortTabsProps) {
  const { t, tt } = useI18n();
  return (
    <div className="sam-tabs sam-tabs--scroll top-24">
      {SORT_OPTIONS.map((opt) => {
        const on = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`${APP_TOP_MENU_ROW1_BASE} ${on ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE}`}
          >
            {opt.labelKey ? t(opt.labelKey) : tt(opt.label)}
          </button>
        );
      })}
    </div>
  );
}
