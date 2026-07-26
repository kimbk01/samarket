"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyOffersView } from "@/components/offers/MyOffersView";

export default function MyOffersReceivedPage() {
  const { t } = useI18n();
  return (
    <MyOffersView
      mode="received"
      title={t("mypage_offers_received_title")}
      emptyLabel={t("mypage_offers_received_empty")}
    />
  );
}
