"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresGreenFixedHeaderChrome } from "@/components/stores/home/hub/StoresGreenFixedHeaderChrome";
import { STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS } from "@/lib/design/stores-home-header-chrome";

/**
 * `/stores/owner/apply` — `StoresHomeHeaderChrome` 와 동일 녹색·전高·행(`--delivery-header-action`).
 */
export function StoresOwnerApplyHeaderChrome() {
  const { t } = useI18n();

  return (
    <StoresGreenFixedHeaderChrome
      title={t("business_phase7_674")}
      backHref="/stores/owner"
      backAriaLabel={t("business_phase7_675")}
      preferHistoryBack
      showSearchAndNotifications
    />
  );
}

export { STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS as STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS };
