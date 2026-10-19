import { Suspense } from "react";
import { TradeDashboardPage } from "@/components/admin/trade/dashboard/TradeDashboardPage";

/** 거래 대시보드 (설계 v2 §E) — 처리 대기 · 현재 상태 · 기간 통계. 기간은 URL 에 둔다. */
export default function AdminTradeHubPage() {
  return (
    <Suspense fallback={null}>
      <TradeDashboardPage />
    </Suspense>
  );
}
