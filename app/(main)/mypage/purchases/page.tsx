"use client";

import { PurchasesView } from "@/components/mypage/PurchasesView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";

export default function MypagePurchasesPage() {
  return (
    <MypageSubpageShell
      titleKey="route_trade_manage_title"
      subtitleKey="route_trade_manage_purchases_subtitle"
      stickyBelow={<MypagePurchaseSalesHubTabs />}
    >
      <PurchasesView />
    </MypageSubpageShell>
  );
}
