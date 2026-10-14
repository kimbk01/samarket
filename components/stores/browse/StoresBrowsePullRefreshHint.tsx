"use client";

import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { storesBrowsePtrStore } from "@/lib/stores/stores-browse-pull-refresh-store";

/** browse 4·5단 사이 PTR 슬롯 — 배경 `#eac784`(dibay-gold), `/stores` 홈과 동일 당김 높이·임계값. UI SSOT: `DibayPtrSlot` */
export function StoresBrowsePullRefreshHint() {
  return (
    <DibayPtrSlot
      store={storesBrowsePtrStore}
      tone="onGold"
      className="bg-[#eac784]"
      dataAttribute="data-stores-browse-ptr-hint"
    />
  );
}
