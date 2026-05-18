"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";

export default function TradeSalesPage() {
  const { t } = useI18n();
  return (
    <TradeHubSectionShell title={t("nav_trade_hub_sales")}>
      <SalesHistoryView />
    </TradeHubSectionShell>
  );
}
