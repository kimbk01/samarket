"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyOffersView } from "@/components/offers/MyOffersView";

export default function MyOffersPage() {
  const { t } = useI18n();
  return (
    <MyOffersView
      mode="sent"
      title={t("mypage_offers_sent_title")}
      emptyLabel={t("mypage_offers_sent_empty")}
    />
  );
}
