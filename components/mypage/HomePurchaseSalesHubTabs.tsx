"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ChatHubSecondaryTabs } from "@/components/chats/ChatHubSecondaryTabs";
import {
  MYPAGE_HOME_TRADE_HUB_HREF,
  MYPAGE_HOME_TRADE_SALES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";

/** Slice 5: home/legacy purchase-sales tabs → trade hub */
export function HomePurchaseSalesHubTabs() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const onPurchases =
    pathname.startsWith("/mypage/trade") && !pathname.startsWith("/mypage/trade/sales")
      ? true
      : pathname.startsWith("/mypage/purchases");
  const onSales =
    pathname.startsWith("/mypage/trade/sales") || pathname.startsWith("/mypage/sales");

  return (
    <ChatHubSecondaryTabs
      items={[
        {
          href: MYPAGE_HOME_TRADE_HUB_HREF,
          label: t("nav_trade_hub_purchases"),
          active: onPurchases,
        },
        {
          href: MYPAGE_HOME_TRADE_SALES_HREF,
          label: t("nav_trade_hub_sales"),
          active: onSales,
        },
      ]}
    />
  );
}
