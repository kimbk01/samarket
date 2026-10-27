import { Suspense } from "react";
import { TradeShowcaseAdminPage } from "@/components/admin/trade/showcase/TradeShowcaseAdminPage";

export default function AdminTradeShowcaseRoute() {
  return (
    <Suspense fallback={null}>
      <TradeShowcaseAdminPage />
    </Suspense>
  );
}
