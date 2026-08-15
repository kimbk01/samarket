"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DIBAY_STATUS_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

/** STATUS / FILTER nav — not PRIMARY route section nav. */
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
  /** @deprecated ignored — STATUS variant is SSOT */
  tabBaseClassName?: string;
}) {
  const { t, tt } = useI18n();
  return (
    <div className={`${DIBAY_STATUS_TABS_CLASS} mb-3`} data-dibay-nav="status">
      {tabs.map(({ id, label, labelKey }) => {
        const n = counts[id] ?? 0;
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={dibaySecondaryTabClass(isActive)}
          >
            {labelKey ? t(labelKey) : tt(label)}
            <span className={isActive ? "ml-1 opacity-90" : "ml-1 opacity-70"}>({n})</span>
          </button>
        );
      })}
    </div>
  );
}
