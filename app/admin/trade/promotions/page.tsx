import { Suspense } from "react";
import { TradePromotionsPage } from "@/components/admin/trade/promotions/TradePromotionsPage";

export default function AdminTradePromotionsRoute() {
  return (
    <Suspense fallback={null}>
      <TradePromotionsPage />
    </Suspense>
  );
}
