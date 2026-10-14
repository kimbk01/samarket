"use client";

import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { tradeMarketPtrStore } from "@/lib/trade/trade-market-pull-refresh-store";

/** `/market` 1단·2단(TradePrimaryTabs) 사이 PTR 슬롯 — 시그니처(DIBAY 그린) 배경. UI SSOT: `DibayPtrSlot` */
export function TradeMarketPullRefreshHint() {
  return (
    <DibayPtrSlot
      store={tradeMarketPtrStore}
      tone="onBrand"
      className="bg-signature"
      dataAttribute="data-trade-market-ptr-hint"
    />
  );
}
