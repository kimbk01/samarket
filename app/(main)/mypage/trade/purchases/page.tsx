import { PurchasesView } from "@/components/mypage/PurchasesView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";

export default function TradePurchasesPage() {
  return (
    <TradeHubSectionShell title="구매 내역">
      <PurchasesView />
    </TradeHubSectionShell>
  );
}
