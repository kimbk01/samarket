"use client";

import { Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";

/** S30 주문 내역 — 공통 셸(`MyScreen` 40rem·16/20px) + `?tab=` (useSearchParams → Suspense) */
export default function MypageStoreOrdersPage() {
  const { t } = useI18n();
  return (
    <MyScreen title={t("route_store_orders_list_title")} backHref="/mypage" template="list">
      <Suspense fallback={<MyStateView kind="loading" template="list" rows={3} listVariant="thumb" />}>
        <MyStoreOrdersView suppressTier1Sync />
      </Suspense>
    </MyScreen>
  );
}
