"use client";

import { Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStoreOrdersView, StoreOrdersListSkeleton } from "@/components/mypage/MyStoreOrdersView";

/** S30 주문 내역 — 공통 셸(`MyScreen` 40rem·16/20px) + `?tab=` (useSearchParams → Suspense) */
export default function MypageStoreOrdersPage() {
  const { t } = useI18n();
  return (
    <MyScreen title={t("route_store_orders_list_title")} backHref="/mypage" template="list">
      {/* 목록 스켈레톤 = 본문 로딩과 같은 주문 카드 골격(탭 + 카드 3) — 대체 화면→본문 로딩 사이 구조 튐 없음 */}
      <Suspense fallback={<StoreOrdersListSkeleton showTabs />}>
        <MyStoreOrdersView suppressTier1Sync />
      </Suspense>
    </MyScreen>
  );
}
