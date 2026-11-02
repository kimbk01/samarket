"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyTabs } from "@/components/mypage/ds/MyTabs";
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
  const pathname = usePathname() ?? "";
  /** 내정보(찜 등) — 내정보 공통 탭. 판매내역·홈 거래 이력 시트 등 다른 화면은 기존 상태 탭 그대로 (분류 설계 S6) */
  if (pathname.startsWith("/mypage/")) {
    return (
      <MyTabs
        className="mb-3"
        value={active}
        onChange={onChange}
        items={tabs.map(({ id, label, labelKey }) => ({
          id,
          label: labelKey ? t(labelKey) : tt(label),
          accessory: <span className="tabular-nums">{counts[id] ?? 0}</span>,
        }))}
      />
    );
  }
  return (
    <div className={`${DIBAY_STATUS_TABS_CLASS} mb-3`} data-dibay-nav="status" data-dibay-tab-tier="filter" role="tablist">
      {tabs.map(({ id, label, labelKey }) => {
        const n = counts[id] ?? 0;
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
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
