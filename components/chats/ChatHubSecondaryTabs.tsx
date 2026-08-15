"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DIBAY_SECONDARY_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

export type ChatHubSecondaryTabItem = {
  href: string;
  label: string;
  labelKey?: MessageKey;
  active: boolean;
  /** false면 같은 페이지 내 전환 시 스크롤을 맨 위로 올리지 않음 */
  scroll?: boolean;
};

/**
 * Purchases / Sales — visual SSOT only. Existing href/active unchanged.
 */
export function ChatHubSecondaryTabs({ items }: { items: ChatHubSecondaryTabItem[] }) {
  const { t, tt } = useI18n();
  return (
    <div className={DIBAY_SECONDARY_TABS_CLASS} role="tablist">
      {items.map((item) => (
        <Link
          key={`${item.href}-${item.label}`}
          href={item.href}
          prefetch={false}
          scroll={item.scroll !== false}
          aria-current={item.active ? "page" : undefined}
          aria-selected={item.active}
          role="tab"
          className={dibaySecondaryTabClass(item.active)}
        >
          {item.labelKey ? t(item.labelKey) : tt(item.label)}
        </Link>
      ))}
    </div>
  );
}
