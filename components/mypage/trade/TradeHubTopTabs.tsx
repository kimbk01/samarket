"use client";

import { useMemo } from "react";
import { AppSegmentTabs, type AppSegmentTabItem } from "@/components/app-shell";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

const ITEMS = [
  { href: "/mypage/trade/purchases", labelKey: "nav_trade_hub_purchases" as const, kind: "exact" as const },
  { href: "/mypage/trade/sales", labelKey: "nav_trade_hub_sales" as const, kind: "exact" as const },
  { href: MYPAGE_TRADE_FAVORITES_HREF, labelKey: "nav_trade_hub_favorites" as const, kind: "exact" as const },
  { href: "/mypage/trade/reviews", labelKey: "nav_trade_hub_reviews" as const, kind: "exact" as const },
  {
    href: "/community-messenger?section=chats&kind=trade",
    labelKey: "nav_trade_hub_chat" as const,
    kind: "messenger" as const,
  },
] as const;

export function TradeHubTopTabs() {
  const { t } = useI18n();
  const tabs = useMemo<AppSegmentTabItem[]>(
    () =>
      ITEMS.map((item) =>
        item.kind === "messenger"
          ? {
              key: item.href,
              label: t(item.labelKey),
              href: item.href,
              matchPrefix: "/community-messenger",
            }
          : {
              key: item.href,
              label: t(item.labelKey),
              href: item.href,
              matchPrefix: item.href.split("?")[0],
              pathMatch: "exact" as const,
            }
      ),
    [t]
  );

  return (
    <div
      aria-label={t("nav_trade_hub_menu")}
      role="navigation"
      className="mt-0 w-full min-w-0 max-w-full overflow-x-hidden"
    >
      <div className={APP_MAIN_HEADER_INNER_CLASS}>
        <AppSegmentTabs tabs={tabs} />
      </div>
    </div>
  );
}
