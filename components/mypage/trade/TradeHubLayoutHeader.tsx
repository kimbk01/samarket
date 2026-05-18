"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function TradeHubLayoutHeader() {
  const { t } = useI18n();
  return (
    <MySubpageHeader
      title={t("tier1_trade_hub_title")}
      subtitle={t("tier1_trade_hub_subtitle")}
      hideCtaStrip
      registerMainTier1={false}
      stickyBelow={<TradeHubTopTabs />}
    />
  );
}
