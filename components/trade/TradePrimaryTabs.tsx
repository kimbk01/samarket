"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { MarketplaceMoreBrowseSheet } from "@/components/trade/MarketplaceMoreBrowseSheet";
import { TradeHeaderLocationPinButton } from "@/components/trade/TradeHeaderLocationPinButton";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { tradePrimaryTabClass } from "@/lib/trade/ui/trade-primary-tabs-classes";
import {
  DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_INNER_CLASS,
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
} from "@/lib/ui/dibay-secondary-tabs";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { menuHrefMatchesIntent, useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { prewarmBottomNavMarketTab } from "@/lib/main-menu/bottom-nav-tap-prewarm-trade";
import { commitTradePrimaryTabRoute } from "@/lib/trade/tabs/commit-trade-primary-tab-route";
import { parseTradeMarketCategoryFromSearch } from "@/lib/trade/tabs/trade-market-feed-href";
import { buildMarketFilterResetHref, countActiveMarketFilters, MarketFilterSheet } from "@/components/trade/MarketFilterSheet";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_HIT_CLASS,
  SAM_TIER1_HEADER_ICON_STROKE_WIDTH,
} from "@/lib/ui/tier1-header-icon";

interface TradePrimaryTabsProps {
  embed?: boolean;
  embedInAppHeader?: boolean;
  /** @deprecated — 전역 `sam-tab` 단일 규칙만 사용 */
  appearance?: "pill" | "inline-text" | "community" | "orders-tab";
}

function TradePrimaryTabsFallback({ embedInAppHeader }: { embedInAppHeader: boolean }) {
  const skeleton = (
    <div className={DIBAY_SECONDARY_TAB_ROW_CLASS} aria-hidden>
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-[length:var(--dibay-secondary-tab-gap,8px)] overflow-hidden">
        <span className="inline-flex min-h-8 min-w-16 animate-pulse rounded-full border border-sam-border bg-sam-surface-muted px-2.5 py-1" />
        <span className="inline-flex min-h-8 min-w-20 animate-pulse rounded-full border border-sam-border bg-sam-surface-muted px-2.5 py-1" />
        <span className="inline-flex min-h-8 min-w-16 animate-pulse rounded-full border border-sam-border bg-sam-surface-muted px-2.5 py-1" />
      </div>
    </div>
  );
  const host = embedInAppHeader
    ? DIBAY_CHROME_SECONDARY_HOST_CLASS
    : DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS;
  return (
    <div className={host} data-dibay-nav="secondary">
      <div className={DIBAY_SECONDARY_TAB_INNER_CLASS}>{skeleton}</div>
    </div>
  );
}

/**
 * Marketplace filter shell (DIBAY, not Facebook clone):
 * 전체 = existing `/market` no category
 * 더보기 = existing `?category=` (CUT A)
 * 지역 = existing location page / city+radius LIST scope (no new ranking)
 */
function TradePrimaryTabsInner({
  embed: _embed = false,
  embedInAppHeader = false,
}: TradePrimaryTabsProps) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { beginMenuNavigation, pendingMenuIntent, isPendingMenuBlockingContent } =
    useLatestMenuNavigation();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const categoryQuery = parseTradeMarketCategoryFromSearch(searchParams);
  const [filterOpen, setFilterOpen] = useState(false);
  const {
    error,
    tabs,
    tradeCategories,
    activeIndex: pathnameActiveIndex,
  } = useTradeTabs(pathname, categoryQuery, searchParams.toString());
  const displayTabs = useMemo(
    () =>
      tabs.map((tab) => ({
        ...tab,
        isDisplayActive:
          pendingMenuIntent?.source === "trade-primary"
            ? menuHrefMatchesIntent(tab.href, pendingMenuIntent)
            : menuHrefMatchesIntent(tab.href, pendingMenuIntent) || tab.isActive,
      })),
    [tabs, pendingMenuIntent]
  );
  const allTab = displayTabs.find((tab) => tab.key === "all");
  const activeDisplayIndex = useMemo(
    () => displayTabs.findIndex((tab) => tab.isDisplayActive),
    [displayTabs]
  );
  const filterCount = countActiveMarketFilters(searchParams.toString());
  const filterActive = filterCount > 0;
  const filterLabel = filterActive
    ? `${t("marketplace_filter_button")} ${filterCount}`
    : t("marketplace_filter_button");

  const commitTab = (href: string, tabKey: string) => {
    const toIdx = displayTabs.findIndex((tab) => tab.key === tabKey);
    if (toIdx < 0) return;
    const fromIdx = activeDisplayIndex >= 0 ? activeDisplayIndex : pathnameActiveIndex;
    commitTradePrimaryTabRoute({
      href,
      fromTabIndex: fromIdx,
      toTabIndex: toIdx,
      beginMenuNavigation,
      guardBeforeNavigate,
      router,
      skipPrewarm: true,
      fromPathname: pathname,
    });
  };

  if (error) {
    return (
      <div
        className={
          embedInAppHeader
            ? DIBAY_CHROME_SECONDARY_HOST_CLASS
            : DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS
        }
        data-dibay-nav="secondary"
      >
        <div className={DIBAY_SECONDARY_TAB_INNER_CLASS}>
          <p className={`${Sam.text.bodySecondary} py-3 text-sam-danger`} role="alert">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DibaySecondaryTabRow
        trackRole="tablist"
        trackAriaLabel={t("trade_138")}
        bordered={!embedInAppHeader}
        leading={<TradeHeaderLocationPinButton placement="below-title" />}
        trailing={
          <div className="inline-flex items-center gap-1">
            {allTab ? (
              <Link
                href={allTab.href}
                role="tab"
                aria-selected={allTab.isDisplayActive}
                aria-label={allTab.label}
                prefetch
                className={`${tradePrimaryTabClass(false)} inline-flex ${SAM_TIER1_HEADER_ICON_HIT_CLASS} shrink-0 items-center justify-center !bg-transparent active:scale-[0.98] active:opacity-90`}
                onPointerEnter={() => prewarmBottomNavMarketTab(allTab.href)}
                onPointerDown={() => prewarmBottomNavMarketTab(allTab.href)}
                onClick={(e) => {
                  e.preventDefault();
                  const resetHref = buildMarketFilterResetHref({
                    baseSearch: searchParams.toString(),
                    topics: tradeCategories,
                  });
                  if (!guardBeforeNavigate(resetHref)) return;
                  prewarmBottomNavMarketTab(resetHref);
                  allTab.href = resetHref;
                  commitTab(allTab.href, allTab.key);
                }}
              >
                <RotateCcw
                  className={`${SAM_TIER1_HEADER_ICON_GLYPH_CLASS} shrink-0 text-sam-primary`}
                  strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
                  aria-hidden
                />
              </Link>
            ) : null}
            <button
              type="button"
              data-marketplace-filter="true"
              className={`relative inline-flex ${SAM_TIER1_HEADER_ICON_HIT_CLASS} shrink-0 items-center justify-center rounded-ui-rect active:scale-[0.98] active:opacity-90`}
              aria-haspopup="dialog"
              aria-label={filterLabel}
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontal
                className={`${SAM_TIER1_HEADER_ICON_GLYPH_CLASS} shrink-0 text-sam-primary`}
                strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
                aria-hidden
              />
              {filterActive ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-signature px-1 text-[10px] font-semibold leading-none text-white">
                  {filterCount}
                </span>
              ) : null}
            </button>
          </div>
        }
      >
        {null}
      </DibaySecondaryTabRow>
      <MarketplaceMoreBrowseSheet
        open={false}
        onClose={() => {}}
        topics={tradeCategories}
        baseSearch={searchParams.toString()}
        onApply={(href, tabKey) => {
          commitTab(href, tabKey);
        }}
      />
      <MarketFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        baseSearch={searchParams.toString()}
        topics={tradeCategories}
      />
    </>
  );
}

export function TradePrimaryTabs(props: TradePrimaryTabsProps) {
  const { embed = false, embedInAppHeader = false } = props;
  if (!embed && !embedInAppHeader) {
    return null;
  }
  return (
    <Suspense fallback={<TradePrimaryTabsFallback embedInAppHeader={Boolean(embedInAppHeader)} />}>
      <TradePrimaryTabsInner {...props} />
    </Suspense>
  );
}
