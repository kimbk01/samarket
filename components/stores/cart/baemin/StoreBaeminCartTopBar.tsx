"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliverySubpageHeader } from "@/components/stores/chrome/DeliverySubpageHeader";

export function StoreBaeminCartTopBar({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <DeliverySubpageHeader
      title={t("store_cart_page_title")}
      onBack={onBack}
      backLabel={t("tier1_back")}
    />
  );
}
