"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyOffersView } from "@/components/offers/MyOffersView";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MyOffersSentPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("mypage_offers_sent_title")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <MyOffersView
          mode="sent"
          title={t("mypage_offers_sent_title")}
          emptyLabel={t("mypage_offers_sent_empty")}
          embedded
        />
      </div>
    </div>
  );
}
