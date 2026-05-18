"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { APP_MAIN_FEED_STACK_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageStoreOrdersPage() {
  const { t } = useI18n();
  return (
    <div className="flex w-full min-w-0 min-h-0 flex-1 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("route_store_orders_list_title")}
        subtitle={t("route_store_orders_list_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`min-h-0 w-full min-w-0 flex-1 ${APP_MAIN_FEED_STACK_CLASS}`}>
        <MyStoreOrdersView suppressTier1Sync />
      </div>
    </div>
  );
}
