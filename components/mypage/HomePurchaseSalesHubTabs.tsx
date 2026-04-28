"use client";

import { usePathname } from "next/navigation";
import { ChatHubSecondaryTabs } from "@/components/chats/ChatHubSecondaryTabs";

/** 구매·판매 내역 (`/mypage/purchases`, `/mypage/sales`, 하위 상세 포함) */
export function HomePurchaseSalesHubTabs() {
  const pathname = usePathname() ?? "";
  const onPurchases =
    pathname === "/mypage/purchases" || pathname.startsWith("/mypage/purchases/");
  const onSales = pathname === "/mypage/sales" || pathname.startsWith("/mypage/sales/");

  return (
    <ChatHubSecondaryTabs
      items={[
        { href: "/mypage/purchases", label: "구매 내역", active: onPurchases },
        { href: "/mypage/sales", label: "판매 내역", active: onSales },
      ]}
    />
  );
}
