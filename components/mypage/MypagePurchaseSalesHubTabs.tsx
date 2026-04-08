"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ChatHubSecondaryTabs } from "@/components/chats/ChatHubSecondaryTabs";

/** 구매·판매 내역·채팅 trade 하단과 동일한 2탭 (`/mypage/purchases`, `/mypage/sales`, 하위 경로 포함) */
export function MypagePurchaseSalesHubTabs() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const onPurchases =
    pathname === "/mypage/purchases" || pathname.startsWith("/mypage/purchases/");
  const onSales = pathname === "/mypage/sales" || pathname.startsWith("/mypage/sales/");

  return (
    <ChatHubSecondaryTabs
      items={[
        { href: "/mypage/purchases", label: t("nav_trade_hub_purchases"), active: onPurchases },
        { href: "/mypage/sales", label: t("nav_trade_hub_sales"), active: onSales },
      ]}
    />
  );
}
