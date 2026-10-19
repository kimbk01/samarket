import { Suspense } from "react";
import { TradeAuditPage } from "@/components/admin/trade/audit/TradeAuditPage";

export default function AdminTradeAuditRoute() {
  return (
    <Suspense fallback={null}>
      <TradeAuditPage />
    </Suspense>
  );
}
