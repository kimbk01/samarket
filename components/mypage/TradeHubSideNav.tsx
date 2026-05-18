/**
 * `/mypage/trade` 전용 — 플로팅 FAB 대신 왼쪽 고정형 사이드 메뉴(목록 내비).
 */
"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const MENU_ITEMS: { sectionId: string; labelKey: MessageKey }[] = [
  { sectionId: "trade-purchases", labelKey: "mypage_comp_nav_sec_trade_purchases_label" },
  { sectionId: "trade-sales", labelKey: "mypage_comp_nav_sec_trade_sales_label" },
  { sectionId: "trade-favorites", labelKey: "mypage_comp_nav_sec_trade_favorites_label" },
  { sectionId: "trade-reviews", labelKey: "mypage_comp_nav_sec_trade_reviews_label" },
  { sectionId: "trade-chat", labelKey: "mypage_comp_trade_hub_chat_nav" },
];

export function TradeHubSideNav() {
  const { t } = useI18n();
  return (
    <aside
      className="sticky z-[1] w-[4.75rem] shrink-0 self-start pt-1 sm:w-32"
      style={{
        top: "calc(6.25rem + env(safe-area-inset-top, 0px))",
      }}
      aria-label={t("mypage_comp_trade_hub_side_nav_aria")}
    >
      <nav className="max-h-[calc(100dvh-7.5rem)] overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-sm">
        <ul className="flex flex-col">
          {MENU_ITEMS.map((item) => (
            <li key={item.sectionId} className="border-b border-[#F0F0F0] last:border-b-0">
              <a
                href={`#${item.sectionId}`}
                className="block px-2 py-2.5 text-center sam-text-xxs font-medium leading-snug text-foreground transition-colors hover:bg-sam-primary-soft active:bg-sam-primary-soft sm:px-3 sm:text-left sm:sam-text-body-secondary sm:leading-tight"
              >
                {t(item.labelKey)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
