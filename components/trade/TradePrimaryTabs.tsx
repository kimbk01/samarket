"use client";

import { parseMarketplaceBrowseStateFromSearchParams } from "@/lib/trade/marketplace/marketplace-browse-state";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { MarketplaceMoreBrowseSheet } from "@/components/trade/MarketplaceMoreBrowseSheet";
import { TradeHeaderLocationPinButton } from "@/components/trade/TradeHeaderLocationPinButton";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import {
  DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_INNER_CLASS,
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { menuHrefMatchesIntent, useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { prewarmBottomNavMarketTab } from "@/lib/main-menu/bottom-nav-tap-prewarm-trade";
import { commitTradePrimaryTabRoute } from "@/lib/trade/tabs/commit-trade-primary-tab-route";
import { parseTradeMarketCategoryFromSearch } from "@/lib/trade/tabs/trade-market-feed-href";
import { countActiveMarketFilters, MarketFilterSheet } from "@/components/trade/MarketFilterSheet";
import { buildMarketplaceBrowseResetCommittedHref } from "@/lib/trade/marketplace/browse-reset-href";
import { applyMarketplaceBrowseResetClientEffects } from "@/lib/trade/marketplace/marketplace-browse-reset-client-effects";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { setMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import {
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
  SAM_TIER1_HEADER_ICON_CLUSTER_CLASS,
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
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
 * 거래 상단 탭 줄 — 거래 E (Owner 2026-10-28, Marketplace 형태): `판매 · 둘러보기 · 지역 · 카테고리 | 📍`.
 * - 판매 = 판매 허브 `/market/sell` (헤더에는 판매 버튼을 두지 않는다)
 * - 둘러보기 = 지금 조건 그대로 최신순(`sort` 제거)
 * - 지역 = 지금 조건 그대로 가까운 순(`sort=near`, 시 중심점 거리)
 * - 카테고리 = 주제 시트(`MarketplaceMoreBrowseSheet`)
 * 주제·검색어 칩, ↺ 초기화, 필터는 그대로다.
 */
function TradePrimaryTabsInner({
  embed: _embed = false,
  embedInAppHeader = false,
}: TradePrimaryTabsProps) {
  const { t, language } = useI18n();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { beginMenuNavigation, pendingMenuIntent, isPendingMenuBlockingContent } =
    useLatestMenuNavigation();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const categoryQuery = parseTradeMarketCategoryFromSearch(searchParams);
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
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
  const activeDisplayIndex = useMemo(
    () => displayTabs.findIndex((tab) => tab.isDisplayActive),
    [displayTabs]
  );
  const searchQuery = (searchParams.get("q") ?? "").trim();
  const selectedTopics = useMemo(() => {
    const state = parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams(searchParams.toString()));
    const ids = state.rootCategoryIds.length > 0 ? state.rootCategoryIds : state.rootCategoryId ? [state.rootCategoryId] : [];
    return ids
      .map((id) => tradeCategories.find((c) => c.id === id || c.slug === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({
        label: language === "en" && c.name_en ? c.name_en : c.name,
        color: c.badge_color ?? null,
      }));
  }, [searchParams, tradeCategories, language]);
  const nearSortActive = useMemo(() => {
    const s = (searchParams.get("sort") ?? searchParams.get("fs") ?? "").trim().toLowerCase();
    return s === "near" || s === "distance";
  }, [searchParams]);
  /** 둘러보기·지역 — 지금 조건(주제·옵션·위치·가격·상태·검색어)은 그대로 두고 정렬만 바꾼다 */
  const sortTabHref = (sort: "latest" | "near") => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("sort");
    next.delete("fs");
    next.delete("page");
    next.delete("cursor");
    if (sort === "near") next.set("sort", "near");
    const qs = next.toString();
    return qs ? `/market?${qs}` : "/market";
  };
  const goSortTab = (sort: "latest" | "near") => {
    const href = sortTabHref(sort);
    if (!guardBeforeNavigate(href)) return;
    setMainAppScrollTop(0);
    router.replace(href, { scroll: false });
  };
  const goSellTab = () => {
    const href = "/market/sell";
    if (!guardBeforeNavigate(href)) return;
    router.push(href);
  };
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
        trackRole={searchQuery ? "presentation" : "tablist"}
        trackAriaLabel={t("trade_138")}
        bordered={!embedInAppHeader}
        leading={<TradeHeaderLocationPinButton placement="below-title" />}
        trailing={
          <div className={`inline-flex items-center ${SAM_TIER1_HEADER_ICON_CLUSTER_CLASS}`}>
            <button
              type="button"
              data-marketplace-browse-reset="true"
              className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} rounded-ui-rect bg-sam-surface active:scale-[0.98] active:opacity-90`}
              aria-label={t("marketplace_filter_clear_all")}
              onClick={() => {
                void buildMarketplaceBrowseResetCommittedHref(
                  "/market",
                  searchParams.toString()
                ).then((resetHref) => {
                  if (!guardBeforeNavigate(resetHref)) return;
                  applyMarketplaceBrowseResetClientEffects();
                  prewarmBottomNavMarketTab(resetHref);
                  router.replace(resetHref, { scroll: false });
                });
              }}
            >
              <RotateCcw
                className={`${SAM_TIER1_HEADER_ICON_GLYPH_CLASS} shrink-0 text-sam-primary`}
                strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
                aria-hidden
              />
            </button>
            <button
              type="button"
              data-marketplace-filter="true"
              className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} relative rounded-ui-rect bg-sam-surface active:scale-[0.98] active:opacity-90`}
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
        <button
          type="button"
          role="tab"
          aria-selected={false}
          data-marketplace-tab="sell"
          className={dibaySecondaryTabClass(false)}
          onClick={goSellTab}
        >
          <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t("marketplace_tab_sell")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!nearSortActive}
          data-marketplace-tab="browse"
          className={dibaySecondaryTabClass(!nearSortActive)}
          onClick={() => goSortTab("latest")}
        >
          <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t("marketplace_tab_browse")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={nearSortActive}
          data-marketplace-tab="nearby"
          className={dibaySecondaryTabClass(nearSortActive)}
          onClick={() => goSortTab("near")}
        >
          <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t("marketplace_tab_nearby")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={false}
          aria-haspopup="dialog"
          data-marketplace-tab="categories"
          className={dibaySecondaryTabClass(false)}
          onClick={() => setCategoryOpen(true)}
        >
          <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t("marketplace_tab_categories")}</span>
        </button>
        {/**
         * CTA-03 (2026-10-27): 검색 결과 화면에 검색어가 어디에도 없었다 — 현재 조건을 칩으로 보이고
         * ✕ 는 q 만 지운다(↺ 는 TM-35 대로 q 를 유지한 채 나머지 초기화).
         */}
        {/**
         * P-6 (2026-10-27, Owner 승인 v3): 고른 주제를 툴바 칩(주제 색 · 아이콘 없음)으로 보이고 ✕ 로 해제한다.
         * 여러 주제면 「첫 주제 외 N」. ✕ 는 주제 조건(category·categoryIds·topic·topicByRoot)만 지운다.
         */}
        {selectedTopics.length > 0 ? (
          <button
            type="button"
            data-marketplace-topic-chip="true"
            aria-label={t("marketplace_topic_chip_clear_aria", { topic: selectedTopics[0]!.label })}
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString());
              for (const k of ["category", "categoryIds", "topic", "topicByRoot"]) next.delete(k);
              const qs = next.toString();
              const href = qs ? `${pathname || "/market"}?${qs}` : pathname || "/market";
              if (!guardBeforeNavigate(href)) return;
              router.replace(href, { scroll: false });
            }}
            className={`inline-flex min-h-8 min-w-0 max-w-full items-center gap-[length:var(--dibay-secondary-tab-gap,8px)] rounded-full px-2.5 text-[13px] font-semibold text-white active:opacity-90 ${
              selectedTopics[0]!.color ? "" : "bg-sam-surface-dark"
            }`}
            style={selectedTopics[0]!.color ? { backgroundColor: selectedTopics[0]!.color } : undefined}
          >
            <span className="min-w-0 truncate">
              {selectedTopics.length > 1
                ? t("marketplace_topic_chip_more", { topic: selectedTopics[0]!.label, count: selectedTopics.length - 1 })
                : selectedTopics[0]!.label}
            </span>
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
        {searchQuery ? (
          <button
            type="button"
            data-marketplace-search-chip="true"
            aria-label={t("marketplace_search_chip_clear_aria", { q: searchQuery })}
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString());
              next.delete("q");
              next.delete("page");
              next.delete("cursor");
              const qs = next.toString();
              const href = qs ? `${pathname || "/market"}?${qs}` : pathname || "/market";
              if (!guardBeforeNavigate(href)) return;
              /** S5: 검색어만 지우고 조건은 유지 — 새 목록을 맨 위부터 */
              setMainAppScrollTop(0);
              router.replace(href, { scroll: false });
            }}
            className="inline-flex min-h-8 min-w-0 max-w-full items-center gap-[length:var(--dibay-secondary-tab-gap,8px)] rounded-full border border-sam-primary bg-sam-surface px-2.5 text-[13px] font-semibold text-sam-primary active:opacity-90"
          >
            <span className="min-w-0 truncate">{t("marketplace_search_chip", { q: searchQuery })}</span>
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
      </DibaySecondaryTabRow>
      <MarketplaceMoreBrowseSheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        topics={tradeCategories}
        baseSearch={searchParams.toString()}
        onApply={(href, tabKey) => {
          setCategoryOpen(false);
          if (displayTabs.some((tab) => tab.key === tabKey)) {
            commitTab(href, tabKey);
            return;
          }
          if (!guardBeforeNavigate(href)) return;
          router.replace(href, { scroll: false });
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
