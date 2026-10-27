import { Suspense } from "react";
import { TradeSearchPage } from "@/components/trade/search/TradeSearchPage";

export default function MarketTradeSearchRoutePage() {
  return (
    <Suspense fallback={null}>
      <TradeSearchPage />
    </Suspense>
  );
}
