"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function TradeHubLayoutHeader() {
  const { t } = useI18n();
  return (
    <MySubpageHeader
      title={t("tier1_trade_hub_title")}
      hideCtaStrip
      registerMainTier1={false}
      stickyBelow={<TradeHubTopTabs />}
    />
  );
}
