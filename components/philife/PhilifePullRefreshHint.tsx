"use client";

import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { philifePtrStore } from "@/lib/philife/philife-pull-refresh-store";

/** `/philife` 1단·2단(주제 탭) 사이 PTR 슬롯 — 시그니처(DIBAY 그린) 배경. UI SSOT: `DibayPtrSlot` */
export function PhilifePullRefreshHint() {
  return (
    <DibayPtrSlot
      store={philifePtrStore}
      tone="onBrand"
      className="bg-signature"
      dataAttribute="data-philife-ptr-hint"
    />
  );
}
