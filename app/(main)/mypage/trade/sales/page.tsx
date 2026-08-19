"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";
import { SellerHubNav } from "@/components/mypage/seller/SellerHubNav";

export default function TradeSalesPage() {
  const { safeT } = useI18n();
  return (
    <TradeHubSectionShell
      title={safeT("marketplace_seller_trades_title", {
        fallbackKo: "거래 관리",
        fallbackEn: "Trade management",
      })}
      description={safeT("marketplace_seller_trades_subtitle", {
        fallbackKo: "구매자별 판매 진행 상황과 채팅",
        fallbackEn: "Buyer-by-buyer progress and chat",
      })}
    >
      <SellerHubNav active="sales" />
      <div className="mt-4">
        <SalesHistoryView />
      </div>
    </TradeHubSectionShell>
  );
}
