import { Suspense } from "react";
import { TradeRegionsPage } from "@/components/admin/trade/regions/TradeRegionsPage";

export default function AdminTradeRegionsRoute() {
  return (
    <Suspense fallback={null}>
      <TradeRegionsPage />
    </Suspense>
  );
}
