import { Suspense } from "react";
import { TradePointsPage } from "@/components/admin/trade/points/TradePointsPage";

export default function AdminTradePointsRoute() {
  return (
    <Suspense fallback={null}>
      <TradePointsPage />
    </Suspense>
  );
}
