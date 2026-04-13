"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

const ITEMS = [
  { href: "/mypage/trade/purchases", labelKey: "nav_trade_hub_purchases", label: "구매 내역" },
  { href: "/mypage/trade/sales", labelKey: "nav_trade_hub_sales", label: "판매 내역" },
  { href: MYPAGE_TRADE_FAVORITES_HREF, labelKey: "nav_trade_hub_favorites", label: "찜 목록" },
  { href: "/mypage/trade/reviews", labelKey: "nav_trade_hub_reviews", label: "후기" },
  {
    href: "/community-messenger?section=chats&kind=trade",
    labelKey: "nav_trade_hub_chat",
    label: "채팅",
  },
] as const;

/** 탭 라벨이 좁은 칸에서도 본문 컬럼 안에만 머물도록 (flex min-width:auto 방지) */
const tabLinkBase = "min-w-0 max-w-full break-words [overflow-wrap:anywhere]";

export function TradeHubTopTabs() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label={t("nav_trade_hub_menu")} className="mt-0 w-full min-w-0 max-w-full">
      <div className={APP_MAIN_HEADER_INNER_CLASS}>
        <ul className="flex min-w-0 w-full border-b border-ig-border bg-[var(--sub-bg)]">
          {ITEMS.map((item) => {
            const active =
              item.href.includes("community-messenger?section=chats")
                ? pathname === "/community-messenger" || pathname.startsWith("/community-messenger/")
                : pathname === item.href;
            return (
              <li key={item.href} className="flex min-w-0 flex-1">
                <Link
                  href={item.href}
                  className={[
                    tabLinkBase,
                    active
                      ? "relative flex min-h-[52px] w-full items-center justify-center bg-[var(--sub-bg)] px-0.5 py-2 text-center text-[12px] font-bold leading-tight text-signature transition-colors after:pointer-events-none after:absolute after:bottom-0 after:left-[10%] after:right-[10%] after:z-[1] after:h-[3px] after:rounded-ui-rect after:bg-signature sm:min-h-[50px] sm:px-1 sm:text-[14px] md:text-[15px]"
                      : "flex min-h-[52px] w-full items-center justify-center px-0.5 py-2 text-center text-[12px] font-semibold leading-tight text-muted transition-colors hover:text-foreground sm:min-h-[50px] sm:px-1 sm:text-[14px] md:text-[15px]",
                  ].join(" ")}
                >
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
