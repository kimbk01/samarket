"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageStoreOrderReviewPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("route_store_order_review_title")}
        subtitle={t("route_store_order_review_subtitle")}
        backHref="/mypage/store-orders"
        hideCtaStrip
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <StoreOrderReviewForm layout="inline" ordersHub={false} />
      </div>
    </div>
  );
}
