"use client";

import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";

export default function MypageSalesPage() {
  return (
    <MypageSubpageShell
      titleKey="route_trade_manage_title"
      subtitleKey="route_trade_manage_sales_subtitle"
      stickyBelow={<MypagePurchaseSalesHubTabs />}
    >
      <SalesHistoryView />
    </MypageSubpageShell>
  );
}
