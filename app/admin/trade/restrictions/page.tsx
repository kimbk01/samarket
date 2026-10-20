import { Suspense } from "react";
import { TradeRestrictionsPage } from "@/components/admin/trade/restrictions/TradeRestrictionsPage";

/** 거래 활동 제한 (설계 v2 §C-5) — 거래 경고·활동 제한 조회·해제·추가 */
export default function AdminTradeRestrictionsRoute() {
  return (
    <Suspense fallback={null}>
      <TradeRestrictionsPage />
    </Suspense>
  );
}
