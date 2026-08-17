"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ChatHubSecondaryTabs } from "@/components/chats/ChatHubSecondaryTabs";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";

/** CUT E: buyer history → Messenger trade list; sales tab unchanged. */
export function HomePurchaseSalesHubTabs() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const onMessenger =
    pathname.startsWith("/community-messenger/trade-chats") ||
    pathname.startsWith("/mypage/purchases") ||
    pathname.startsWith("/philife/purchases");
  const onSales =
    pathname.startsWith("/mypage/trade/sales") ||
    pathname.startsWith("/mypage/sales") ||
    pathname.startsWith("/philife/sales");

  return (
    <ChatHubSecondaryTabs
      items={[
        {
          href: TRADE_CHAT_MESSENGER_LIST_HREF,
          label: t("nav_trade_hub_chat"),
          active: onMessenger,
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
