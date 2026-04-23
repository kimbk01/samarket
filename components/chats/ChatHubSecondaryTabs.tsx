"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

export type ChatHubSecondaryTabItem = {
  href: string;
  label: string;
  labelKey?: MessageKey;
  active: boolean;
  /** false면 같은 페이지 내 전환 시 스크롤을 맨 위로 올리지 않음 */
  scroll?: boolean;
};

/**
 * `/chats` trade — 구매·판매.
 * 상단 `ChatHubTopTabs` primary와 **글자 크기·색만** 맞추고, 탭 UI는 2분할 하단 보더 형태 유지.
 */
export function ChatHubSecondaryTabs({ items }: { items: ChatHubSecondaryTabItem[] }) {
  const { t, tt } = useI18n();
  return (
    <div className="border-b border-sam-border bg-sam-surface">
      <div className={`mx-auto w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} px-4`}>
        <div className={Sam.tabs.bar}>
        {items.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            prefetch={false}
            scroll={item.scroll !== false}
            aria-current={item.active ? "page" : undefined}
            aria-selected={item.active}
            role="tab"
            className={item.active ? Sam.tabs.tabActive : Sam.tabs.tab}
          >
            {item.labelKey ? t(item.labelKey) : tt(item.label)}
          </Link>
        ))}
        </div>
      </div>
    </div>
  );
}
