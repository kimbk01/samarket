import { Suspense } from "react";
import { TradeReportsPage } from "@/components/admin/trade/reports/TradeReportsPage";

/** 거래 신고 (설계 v2 §C-4) — 거래글·회원·거래 채팅 신고 처리 */
export default function AdminTradeReportsRoute() {
  return (
    <Suspense fallback={null}>
      <TradeReportsPage />
    </Suspense>
  );
}
