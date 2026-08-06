"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export function PurchaseDetailInvalidRoute() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col items-center justify-center bg-sam-app px-4 py-8">
      <p className="text-center sam-text-body text-sam-muted">{t("route_invalid_path")}</p>
    </div>
  );
}

export function PurchaseDetailRouteChrome({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("route_purchase_detail_title")}
        subtitle={t("route_purchase_detail_subtitle")}
        backHref="/mypage/trade"
        hideCtaStrip
        stickyBelow={<MypagePurchaseSalesHubTabs />}
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>{children}</div>
    </div>
  );
}
