"use client";

import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
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
import { scrollTradePrimaryTabStrip } from "@/lib/trade/tabs/scroll-trade-primary-tab-strip";
import { parseTradeMarketCategoryFromSearch } from "@/lib/trade/tabs/trade-market-feed-href";
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
 * TRADE 주제 1행 — Community / Chat 과 동일 `DibaySecondaryTabRow` SSOT.
 * Presentation only: 전체 feed = existing `/market` (no category). Sort is not this row's authority.
 * `useSearchParams()` — Next 정적 생성용 `Suspense` 경계.
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
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const categoryStripRef = useRef<HTMLDivElement | null>(null);
  const topicTabScrollGenRef = useRef(0);
  const categoryQuery = parseTradeMarketCategoryFromSearch(searchParams);
  const { error, tabs, activeIndex: pathnameActiveIndex } = useTradeTabs(
    pathname,
    categoryQuery
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

  useLayoutEffect(() => {
    const myGen = ++topicTabScrollGenRef.current;
    const toCancel: number[] = [];
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        if (topicTabScrollGenRef.current !== myGen) return;
        const root = categoryStripRef.current;
        if (!root) return;
        const stripActiveIndex = displayTabs.findIndex((t) => t.isDisplayActive);
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
  }, [displayTabs]);

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
    <DibaySecondaryTabRow
      ref={categoryStripRef}
      trackRole="tablist"
      trackAriaLabel={t("trade_138")}
      bordered={!embedInAppHeader}
    >
      {displayTabs.map((tab) => (
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
