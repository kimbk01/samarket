"use client";

import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreOrderDetailView } from "@/components/mypage/MyStoreOrderDetailView";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageStoreOrderDetailPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("route_store_order_detail_title")}
        subtitle={t("route_store_order_detail_subtitle")}
        backHref="/mypage/store-orders"
        preferHistoryBack
        hideCtaStrip
        rightSlot={<CommerceCartHeaderLink />}
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <MyStoreOrderDetailView />
      </div>
    </div>
  );
}
