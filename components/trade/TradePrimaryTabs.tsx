"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { MarketplaceMoreBrowseSheet } from "@/components/trade/MarketplaceMoreBrowseSheet";
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
import { TRADE_BROWSE_LOCATION_PATH } from "@/lib/trade/location/trade-browse-location-paths";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const [moreOpen, setMoreOpen] = useState(false);
  const categoryQuery = parseTradeMarketCategoryFromSearch(searchParams);
  const locationScope = parseTradeLocationScopeFromSearchParams(searchParams);
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
  const categoryTabs = displayTabs.filter((tab) => tab.key !== "all");
  const activeCategory = categoryTabs.find((tab) => tab.isDisplayActive) ?? null;
  const activeDisplayIndex = useMemo(
    () => displayTabs.findIndex((tab) => tab.isDisplayActive),
    [displayTabs]
  );

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

  const openLocation = () => {
    const q = searchParams.toString();
    const href = q ? `${TRADE_BROWSE_LOCATION_PATH}?${q}` : TRADE_BROWSE_LOCATION_PATH;
    if (!guardBeforeNavigate(href)) return;
    router.push(href);
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
      >
        {allTab ? (
          <Link
            href={allTab.href}
            role="tab"
            aria-selected={allTab.isDisplayActive}
            prefetch
            className={tradePrimaryTabClass(allTab.isDisplayActive)}
            onPointerEnter={() => prewarmBottomNavMarketTab(allTab.href)}
            onPointerDown={() => prewarmBottomNavMarketTab(allTab.href)}
            onClick={(e) => {
              e.preventDefault();
              const hasQ = Boolean(sanitizeMarketplaceQueryText(searchParams.get("q")));
              if (allTab.isDisplayActive && !hasQ) {
                if (
                  !isPendingMenuBlockingContent ||
                  menuHrefMatchesIntent(allTab.href, pendingMenuIntent)
                ) {
                  return;
                }
              }
              if (!guardBeforeNavigate(allTab.href)) return;
              prewarmBottomNavMarketTab(allTab.href);
              commitTab(allTab.href, allTab.key);
            }}
          >
            <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{allTab.label}</span>
          </Link>
        ) : null}
        <button
          type="button"
          data-marketplace-more-categories="true"
          role="tab"
          aria-selected={Boolean(activeCategory)}
          aria-haspopup="dialog"
          className={tradePrimaryTabClass(Boolean(activeCategory))}
          onClick={() => setMoreOpen(true)}
        >
          <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>
            {activeCategory?.label ?? t("marketplace_more_categories")}
          </span>
        </button>
        <button
          type="button"
          data-marketplace-region-chip="true"
          className={tradePrimaryTabClass(locationScope.mode === "city")}
          onClick={openLocation}
        >
          <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t("marketplace_region_chip")}</span>
        </button>
      </DibaySecondaryTabRow>
      <MarketplaceMoreBrowseSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        topics={tradeCategories}
        baseSearch={searchParams.toString()}
        onApply={(href, tabKey) => {
          setMoreOpen(false);
          if (!guardBeforeNavigate(href)) return;
          prewarmBottomNavMarketTab(href);
          commitTab(href, tabKey);
        }}
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
