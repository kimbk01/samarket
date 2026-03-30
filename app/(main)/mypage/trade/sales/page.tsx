import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";

export default function TradeSalesPage() {
  return (
    <TradeHubSectionShell title="판매 내역">
      <SalesHistoryView />
    </TradeHubSectionShell>
  );
}
