"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import {
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";

export type ChatHubSecondaryTabItem = {
  href: string;
  label: string;
  labelKey?: MessageKey;
  active: boolean;
  /** false면 같은 페이지 내 전환 시 스크롤을 맨 위로 올리지 않음 */
  scroll?: boolean;
};

/**
 * Purchases / Sales — Community / Trade / Chat 2단 SSOT.
 */
export function ChatHubSecondaryTabs({ items }: { items: ChatHubSecondaryTabItem[] }) {
  const { t, tt } = useI18n();
  return (
    <DibaySecondaryTabRow bordered>
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
          <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>
            {item.labelKey ? t(item.labelKey) : tt(item.label)}
          </span>
        </Link>
      ))}
    </DibaySecondaryTabRow>
  );
}
