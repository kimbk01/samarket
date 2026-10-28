"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { MarketplaceMoreBrowseSheet } from "@/components/trade/MarketplaceMoreBrowseSheet";
import { TradeHeaderLocationPinButton } from "@/components/trade/TradeHeaderLocationPinButton";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import {
  DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_INNER_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
} from "@/lib/ui/dibay-secondary-tabs";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { menuHrefMatchesIntent, useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { commitTradePrimaryTabRoute } from "@/lib/trade/tabs/commit-trade-primary-tab-route";
import { parseTradeMarketCategoryFromSearch } from "@/lib/trade/tabs/trade-market-feed-href";
import { MarketFilterSheet } from "@/components/trade/MarketFilterSheet";
import { countMarketAppliedConditions } from "@/lib/trade/marketplace/market-applied-conditions";
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

/** 거래 상단 탭(시안 v2) — 고른 탭만 연한 초록 바탕, 나머지는 글자만. 높이 36px(2단 SSOT 항목 높이와 같음) */
function tradeTopTabClass(active: boolean): string {
  return `inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[14px] font-semibold active:opacity-80 ${
    /** 헤더 바탕이 연녹색이라 `--sam-primary-soft`(9%)로는 구분되지 않아 16% 로 칠한다 */
    active
      ? "bg-[color:color-mix(in_srgb,var(--sam-primary)_16%,transparent)] text-sam-primary"
      : "bg-transparent text-sam-fg"
  }`;
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
  const { t } = useI18n();
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
  /** 적용된 조건 수(검색어·주제·옵션·가격·상태·정렬) — `market-applied-conditions` SSOT. 조건 내용은 필터 시트 맨 위에서 본다 */
  const filterCount = countMarketAppliedConditions(searchParams.toString());
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

  /**
   * 거래 상단 시안 v2 (Owner 2026-10-28 승인, 레퍼런스 Facebook Marketplace) — 한 줄
   * `판매 · 둘러보기 · 지역 · 카테고리 | 📍 · 필터`. 고른 탭만 연한 초록 바탕, 나머지는 글자만.
   * 위치 이름·↺ 는 이 줄에 두지 않는다(위치는 📍 시트, 초기화는 필터 시트 「전체 초기화」).
   * **헤더 3단(조건 칩 줄)은 없다**(Owner 2026-10-28) — 검색어·주제·옵션 등 적용된 조건은 필터 시트 맨 위 「적용된 조건」에서 보고 ✕ 로 뺀다.
   */

  return (
    <>
      <DibaySecondaryTabRow
        trackRole="tablist"
        trackAriaLabel={t("trade_138")}
        bordered={!embedInAppHeader}
        /** 384px 폰에서 스크롤 없이 한 줄 — **이 줄에서만** 칸 여백 0·간격 4px(공용 SSOT 값은 그대로) */
        hostClassName="[--dibay-secondary-tab-pad-x:0px] [--dibay-secondary-tab-gap:4px]"
        trailing={
          <div className={`inline-flex items-center ${SAM_TIER1_HEADER_ICON_CLUSTER_CLASS}`}>
            <span className="mx-1 h-6 w-px shrink-0 bg-sam-border" aria-hidden />
            <TradeHeaderLocationPinButton placement="icon-only" />
            <button
              type="button"
              data-marketplace-filter="true"
              className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} relative rounded-ui-rect active:scale-[0.98] active:opacity-90`}
              aria-haspopup="dialog"
              aria-label={filterLabel}
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontal
                className={`${SAM_TIER1_HEADER_ICON_GLYPH_CLASS} shrink-0 text-sam-fg`}
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
          className={tradeTopTabClass(false)}
          onClick={goSellTab}
        >
          {t("marketplace_tab_sell")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!nearSortActive}
          data-marketplace-tab="browse"
          className={tradeTopTabClass(!nearSortActive)}
          onClick={() => goSortTab("latest")}
        >
          {t("marketplace_tab_browse")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={nearSortActive}
          data-marketplace-tab="nearby"
          className={tradeTopTabClass(nearSortActive)}
          onClick={() => goSortTab("near")}
        >
          {t("marketplace_tab_nearby")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={false}
          aria-haspopup="dialog"
          data-marketplace-tab="categories"
          className={tradeTopTabClass(false)}
          onClick={() => setCategoryOpen(true)}
        >
          {t("marketplace_tab_categories")}
        </button>
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
