"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TradeHeaderLocationPinButton } from "@/components/trade/TradeHeaderLocationPinButton";
import { DibayActionSheet } from "@/components/ui/dibay-overlay/DibayActionSheet";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
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
  const { t, safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "/market";
  const searchParams = useSearchParams();
  const { open: openTradeWriteSheet } = useTradeWriteSheet();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const writeCtx = useWriteCategory();
  const urlQ = sanitizeMarketplaceQueryText(searchParams.get("q")) ?? "";
  const [draft, setDraft] = useState(urlQ);
  const [sellOpen, setSellOpen] = useState(false);

  useEffect(() => {
    setDraft(urlQ);
  }, [urlQ]);

  const applyQuery = (raw: string) => {
    const next = sanitizeMarketplaceQueryText(raw);
    const sp = new URLSearchParams(searchParams.toString());
    if (next) sp.set("q", next);
    else sp.delete("q");
    const qs = sp.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.replace(href, { scroll: false });
  };

  const openWrite = () => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    if (!guardBeforeNavigate()) return;
    openTradeWriteSheet("");
  };

  const go = (href: string) => {
    if (!guardBeforeNavigate(href)) return;
    router.push(href);
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
          <form
            className="min-w-0 flex-1"
            data-marketplace-search-entry="true"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              applyQuery(String(fd.get("q") ?? draft));
            }}
          >
            <label className="flex min-h-11 min-w-0 items-center gap-2 overflow-hidden rounded-ui-rect bg-sam-surface-muted px-3 py-2">
              <SearchGlyph />
              <input
                type="search"
                name="q"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={searchLabel}
                aria-label={t("marketplace_search_entry_aria")}
                className="min-w-0 flex-1 border-0 bg-transparent sam-text-body text-sam-fg placeholder:text-sam-muted focus:outline-none focus:ring-0"
              />
            </label>
          </form>
          <button
            type="button"
            data-marketplace-sell-cta="true"
            onClick={() => setSellOpen(true)}
            className="flex h-11 shrink-0 items-center rounded-ui-rect bg-signature px-3.5 sam-text-body font-semibold text-white active:scale-[0.98] active:opacity-90"
          >
            {t("trade_write_sell_cta")}
          </button>
        </div>
      </div>
      <DibayActionSheet
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        title={t("marketplace_sell_hub_title")}
        cancelLabel={t("common_cancel")}
        items={[
          {
            key: "create",
            label: t("marketplace_sell_hub_create"),
            onClick: openWrite,
          },
          {
            key: "listings",
            label: t("marketplace_sell_hub_listings"),
            onClick: () => go("/mypage/products"),
          },
          {
            key: "sales",
            label: t("trade_122"),
            onClick: () => go(MYPAGE_HOME_TRADE_SALES_HREF),
          },
          {
            key: "mypage",
            label: t("nav_bottom_my"),
            onClick: () => go("/mypage"),
          },
        ]}
      />
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-sam-muted"
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
