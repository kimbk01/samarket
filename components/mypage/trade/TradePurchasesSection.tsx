import { PurchasesView } from "@/components/mypage/PurchasesView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";

/** `/mypage/trade` · `/mypage/trade/purchases` 공통 — 리다이렉트 없이 동일 본문 재사용 */
export function TradePurchasesSection() {
  return (
    <TradeHubSectionShell title="구매 내역">
      <PurchasesView />
    </TradeHubSectionShell>
  );
}
