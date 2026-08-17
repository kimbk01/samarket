"use client";

import { createPortal } from "react-dom";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { tradePrimaryTabClass } from "@/lib/trade/ui/trade-primary-tabs-classes";
import {
  DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_CHEVRON_CLASS,
  DIBAY_SECONDARY_TAB_INNER_CLASS,
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
} from "@/lib/ui/dibay-secondary-tabs";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { menuHrefMatchesIntent, useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { prewarmBottomNavMarketTab } from "@/lib/main-menu/bottom-nav-tap-prewarm-trade";
import { commitTradePrimaryTabRoute } from "@/lib/trade/tabs/commit-trade-primary-tab-route";
import { scrollTradePrimaryTabStrip } from "@/lib/trade/tabs/scroll-trade-primary-tab-strip";
import {
  buildTradeMarketFeedHref,
  parseTradeMarketCategoryFromSearch,
} from "@/lib/trade/tabs/trade-market-feed-href";
import { parseMarketplacePublicTradeState } from "@/lib/trade/marketplace/public-listing-status";
import { isTradeMarketAllRouteActive } from "@/lib/categories/tradeMarketPath";
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
      <span className="inline-flex min-h-8 min-w-16 shrink-0 animate-pulse rounded-full border border-sam-border bg-sam-surface-muted px-2.5 py-1" />
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-[length:var(--dibay-secondary-tab-gap,8px)] overflow-hidden">
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
 * TRADE 메뉴 탭 — Community / Chat 과 동일 `DibaySecondaryTabRow` SSOT.
 * `useSearchParams()` — Next 정적 생성용 `Suspense` 경계.
 */
function TradePrimaryTabsInner({
  embed: _embed = false,
  embedInAppHeader = false,
}: TradePrimaryTabsProps) {
  const { t, safeT } = useI18n();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { beginMenuNavigation, pendingMenuIntent, isPendingMenuBlockingContent } =
    useLatestMenuNavigation();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const categoryStripRef = useRef<HTMLDivElement | null>(null);
  const topicTabScrollGenRef = useRef(0);
  const categoryQuery = parseTradeMarketCategoryFromSearch(searchParams);
  const { loading: _loading, error, tabs, activeIndex: pathnameActiveIndex } = useTradeTabs(
    pathname,
    categoryQuery
  );
  const [allSortOpen, setAllSortOpen] = useState(false);
  const [allSortMenuPos, setAllSortMenuPos] = useState<{ top: number; left: number } | null>(null);
  const allSortButtonRef = useRef<HTMLButtonElement | null>(null);
  const allSortMenuRef = useRef<HTMLUListElement | null>(null);
  const tradeStateRaw = searchParams.get("tradeState")?.trim() ?? "";
  const tradeState = parseMarketplacePublicTradeState(tradeStateRaw);
  const allSortLabel =
    tradeState === "active"
      ? safeT("trade_market_sort_active")
      : tradeState === "sold"
        ? safeT("trade_listing_step_completed")
        : safeT("trade_market_sort_latest");
  const tradeSortOptions = useMemo(
    () =>
      [
        { key: "latest" as const, label: safeT("trade_market_sort_latest") },
        { key: "active" as const, label: safeT("trade_market_sort_active") },
        { key: "sold" as const, label: safeT("trade_listing_step_completed") },
      ],
    [safeT]
  );
  const allTradeHref = buildTradeMarketFeedHref({
    tradeState: tradeState === "latest" ? null : tradeState,
  });
  const setTradeState = useCallback(
    (next: "latest" | "active" | "sold") => {
      const nextHref = buildTradeMarketFeedHref({
        tradeState: next === "latest" ? null : next,
      });
      if (next === tradeState && isTradeMarketAllRouteActive(pathname, categoryQuery)) {
        setAllSortOpen(false);
        return;
      }
      if (!guardBeforeNavigate(nextHref)) return;
      beginMenuNavigation(nextHref, "trade-primary", { mainShellPushAxis: null });
      void router.replace(nextHref, { scroll: false });
      setAllSortOpen(false);
    },
    [beginMenuNavigation, router, pathname, categoryQuery, tradeState, guardBeforeNavigate]
  );
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
    () => displayTabs.findIndex((t) => t.isDisplayActive),
    [displayTabs]
  );

  const updateAllSortMenuPos = useCallback(() => {
    const el = allSortButtonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAllSortMenuPos({ top: rect.bottom + 6, left: rect.left });
  }, []);

  const onTradeAllSortChipClick = useCallback(() => {
    const onAll = isTradeMarketAllRouteActive(pathname, categoryQuery);
    if (!onAll) {
      const href = buildTradeMarketFeedHref({
        tradeState: tradeState === "latest" ? null : tradeState,
      });
      if (guardBeforeNavigate(href)) {
        beginMenuNavigation(href, "trade-primary", { mainShellPushAxis: null });
        void router.replace(href, { scroll: false });
      }
    }
    if (allSortOpen) {
      setAllSortOpen(false);
    } else {
      updateAllSortMenuPos();
      setAllSortOpen(true);
    }
  }, [
    allSortOpen,
    beginMenuNavigation,
    categoryQuery,
    guardBeforeNavigate,
    pathname,
    router,
    tradeState,
    updateAllSortMenuPos,
  ]);

  const categoryTabs = useMemo(
    () => displayTabs.filter((tab) => tab.key !== "all"),
    [displayTabs]
  );

  useLayoutEffect(() => {
    const myGen = ++topicTabScrollGenRef.current;
    const toCancel: number[] = [];
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        if (topicTabScrollGenRef.current !== myGen) return;
        const root = categoryStripRef.current;
        if (!root) return;
        const stripActiveIndex = categoryTabs.findIndex((t) => t.isDisplayActive);
        if (stripActiveIndex < 0) {
          if (root.scrollLeft !== 0) root.scrollTo({ left: 0, behavior: "auto" });
          return;
        }
        const sel = root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
        if (!sel) return;
        scrollTradePrimaryTabStrip(root, sel, stripActiveIndex, 6);
      });
      toCancel.push(r2);
    });
    toCancel.push(r1);
    return () => {
      topicTabScrollGenRef.current += 1;
      for (const id of toCancel) cancelAnimationFrame(id);
    };
  }, [categoryTabs]);

  useEffect(() => {
    if (!allSortOpen) return;
    updateAllSortMenuPos();
    const close = () => setAllSortOpen(false);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (allSortButtonRef.current?.contains(target) || allSortMenuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [allSortOpen, updateAllSortMenuPos]);

  const onAllTrade =
    pendingMenuIntent?.source === "trade-primary"
      ? menuHrefMatchesIntent(allTradeHref, pendingMenuIntent)
      : menuHrefMatchesIntent(allTradeHref, pendingMenuIntent) ||
        isTradeMarketAllRouteActive(pathname, categoryQuery);

  const allSortChip = (
    <button
      type="button"
      role="tab"
      aria-selected={onAllTrade}
      aria-haspopup="listbox"
      aria-expanded={allSortOpen}
      aria-label={t("trade_market_sort_chip_aria", { label: allSortLabel })}
      ref={allSortButtonRef}
      onClick={onTradeAllSortChipClick}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          updateAllSortMenuPos();
          setAllSortOpen(true);
        }
      }}
      className={`${tradePrimaryTabClass(onAllTrade)} inline-flex shrink-0 items-center gap-[length:var(--dibay-secondary-tab-gap,8px)]`}
    >
      <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{allSortLabel}</span>
      {allSortOpen ? (
        <ChevronUp className={DIBAY_SECONDARY_TAB_CHEVRON_CLASS} strokeWidth={2.4} aria-hidden />
      ) : (
        <ChevronDown className={DIBAY_SECONDARY_TAB_CHEVRON_CLASS} strokeWidth={2.4} aria-hidden />
      )}
    </button>
  );

  const allSortMenuPortal =
    allSortOpen && allSortMenuPos && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={allSortMenuRef}
            role="listbox"
            aria-label={t("trade_015")}
            className="min-w-[10rem] rounded-sam-md border border-sam-border bg-sam-surface py-1 shadow-sam-elevated"
            style={{ position: "fixed", top: allSortMenuPos.top, left: allSortMenuPos.left, zIndex: 200 }}
          >
            {tradeSortOptions.map((opt) => (
              <li key={opt.key} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={tradeState === opt.key}
                  onClick={() => setTradeState(opt.key)}
                  className="block w-full px-3 py-2 text-left text-[length:calc(14px-1pt)] font-semibold text-sam-fg transition hover:bg-sam-surface-muted"
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )
      : null;

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
        {allSortMenuPortal}
      </div>
    );
  }

  return (
    <>
      <DibaySecondaryTabRow
        ref={categoryStripRef}
        leading={allSortChip}
        trackRole="presentation"
        trackAriaLabel={t("trade_138")}
        bordered={!embedInAppHeader}
      >
        {categoryTabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            ref={(el) => {
              tabRefs.current[tab.key] = el;
            }}
            role="tab"
            aria-selected={tab.isDisplayActive}
            prefetch
            className={tradePrimaryTabClass(tab.isDisplayActive)}
            onPointerEnter={() => prewarmBottomNavMarketTab(tab.href)}
            onPointerDown={() => prewarmBottomNavMarketTab(tab.href)}
            onClick={(e) => {
              e.preventDefault();
              if (tab.isDisplayActive) {
                if (
                  !isPendingMenuBlockingContent ||
                  menuHrefMatchesIntent(tab.href, pendingMenuIntent)
                ) {
                  return;
                }
              }
              if (!guardBeforeNavigate(tab.href)) return;
              prewarmBottomNavMarketTab(tab.href);
              const toIdx = displayTabs.findIndex((t) => t.key === tab.key);
              if (toIdx < 0) return;
              const fromIdx =
                activeDisplayIndex >= 0 ? activeDisplayIndex : pathnameActiveIndex;
              commitTradePrimaryTabRoute({
                href: tab.href,
                fromTabIndex: fromIdx,
                toTabIndex: toIdx,
                beginMenuNavigation,
                guardBeforeNavigate,
                router,
                skipPrewarm: true,
                fromPathname: pathname,
              });
            }}
          >
            <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{tab.label}</span>
          </Link>
        ))}
      </DibaySecondaryTabRow>
      {allSortMenuPortal}
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
