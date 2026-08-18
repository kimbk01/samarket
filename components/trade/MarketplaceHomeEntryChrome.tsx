"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TradeHeaderLocationPinButton } from "@/components/trade/TradeHeaderLocationPinButton";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import {
  APP_MAIN_COLUMN_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";

/**
 * Marketplace HOME entry chrome — location, visible search, visible 판매하기.
 * Search → existing `/search`. Sell → existing trade WRITE sheet.
 * DO NOT: new routes, CUT C backend, topic/filter semantics.
 */
export function MarketplaceHomeEntryChrome() {
  const { t, safeT } = useI18n();
  const { open: openTradeWriteSheet } = useTradeWriteSheet();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const writeCtx = useWriteCategory();

  const openWrite = () => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    if (!guardBeforeNavigate()) return;
    openTradeWriteSheet("");
  };

  const searchLabel = safeT("marketplace_search_placeholder", {
    fallbackKo: "Marketplace에서 검색",
    fallbackEn: "Search Marketplace",
  });

  return (
    <div className="min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]">
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} flex flex-col gap-2 pb-2 pt-0.5`}>
        <TradeHeaderLocationPinButton placement="below-title" />
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/search"
            data-marketplace-search-entry="true"
            aria-label={t("marketplace_search_entry_aria")}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-left sam-text-body text-sam-muted"
          >
            <SearchGlyph />
            <span className="min-w-0 truncate">{searchLabel}</span>
          </Link>
          <button
            type="button"
            data-marketplace-sell-cta="true"
            onClick={openWrite}
            className="flex h-11 shrink-0 items-center rounded-ui-rect bg-signature px-3.5 sam-text-body font-semibold text-white active:scale-[0.98] active:opacity-90"
          >
            {t("trade_write_sell_cta")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}
