"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TradeHeaderLocationPinButton } from "@/components/trade/TradeHeaderLocationPinButton";
import {
  APP_MAIN_COLUMN_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";

/**
 * Marketplace HOME entry chrome — location, in-page search, sell hub.
 * Search stays on `/market?q=` (CUT C). Sell hub → WRITE / my listings / sales / mypage.
 * DO NOT: Facebook clone, new routes, CUT C backend, LIST ranking.
 */
export function MarketplaceHomeEntryChrome() {
  const { t } = useI18n();

  return (
    <div className="min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]">
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} flex flex-col gap-2 pb-2 pt-0.5`}>
        <TradeHeaderLocationPinButton placement="below-title" />
        <p className="sr-only">{t("marketplace_search_entry_aria")}</p>
      </div>
    </div>
  );
}
