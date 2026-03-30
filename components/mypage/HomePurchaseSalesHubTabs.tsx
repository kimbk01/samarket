"use client";

import { usePathname } from "next/navigation";
import { ChatHubSecondaryTabs } from "@/components/chats/ChatHubSecondaryTabs";

/** 홈 플로팅에서 진입한 구매·판매 내역 (`/home/purchases`, `/home/sales`, 하위 상세 포함) */
export function HomePurchaseSalesHubTabs() {
  const pathname = usePathname() ?? "";
  const onPurchases =
    pathname === "/home/purchases" || pathname.startsWith("/home/purchases/");
  const onSales = pathname === "/home/sales" || pathname.startsWith("/home/sales/");

  return (
    <ChatHubSecondaryTabs
      items={[
        { href: "/home/purchases", label: "구매 내역", active: onPurchases },
        { href: "/home/sales", label: "판매 내역", active: onSales },
      ]}
    />
  );
}
