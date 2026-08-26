"use client";

import { Suspense } from "react";
import { BuyerGiftMallView } from "@/components/gift-certificate/BuyerGiftMallView";

function GiftMallFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

export default function GiftMallPage() {
  return (
    <Suspense fallback={<GiftMallFallback />}>
      <BuyerGiftMallView />
    </Suspense>
  );
}
