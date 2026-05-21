"use client";

import { PurchasesView } from "@/components/mypage/PurchasesView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** `/mypage/trade` · `/mypage/trade/purchases` 공통 — 리다이렉트 없이 동일 본문 재사용 */
export function TradePurchasesSection() {
  const { t } = useI18n();
  return (
    <TradeHubSectionShell title={t("mypage_comp_nav_sec_trade_purchases_label")}>
      <PurchasesView />
    </TradeHubSectionShell>
  );
}
