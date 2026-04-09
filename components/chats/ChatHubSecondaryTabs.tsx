"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
    <div className="border-b border-ig-border bg-white">
      <div className="mx-auto flex max-w-lg px-4">
        {items.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            prefetch={false}
            scroll={item.scroll !== false}
            aria-current={item.active ? "page" : undefined}
            className={[
              "flex-1 border-b-2 px-2 py-3 text-center text-[16px] transition-colors duration-200",
              item.active
                ? "border-signature font-semibold text-signature"
                : "border-transparent font-medium text-muted hover:text-foreground",
            ].join(" ")}
          >
            {item.labelKey ? t(item.labelKey) : tt(item.label)}
          </Link>
        ))}
      </div>
    </div>
  );
}
