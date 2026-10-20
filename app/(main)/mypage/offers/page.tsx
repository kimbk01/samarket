"use client";

import { Suspense } from "react";
import { MyOffersTabsScreen } from "@/components/offers/MyOffersTabsScreen";

/** 가격 제안 — `/mypage/offers?tab=received|sent` (최종 설계 S23). 기본 = 받은 제안. */
export default function MyOffersPage() {
  return (
    <Suspense fallback={null}>
      <MyOffersTabsScreen />
    </Suspense>
  );
}
