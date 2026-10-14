"use client";

import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { messengerPtrStore } from "@/lib/community-messenger/messenger-pull-refresh-store";

/** `/community-messenger` 1단 아래 PTR 슬롯 — 커뮤니티와 동일 시그니처 배경. UI SSOT: `DibayPtrSlot` */
export function MessengerPullRefreshHint() {
  return (
    <DibayPtrSlot
      store={messengerPtrStore}
      tone="onBrand"
      className="bg-signature"
      dataAttribute="data-messenger-ptr-hint"
    />
  );
}
