"use client";

import { createPortal } from "react-dom";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { tradePrimaryTabClass } from "@/lib/trade/ui/trade-primary-tabs-classes";
import {
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TABS_CLASS,
} from "@/lib/ui/dibay-secondary-tabs";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { menuHrefMatchesIntent, useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { prewarmBottomNavMarketTab } from "@/lib/main-menu/bottom-nav-tap-prewarm-trade";
import { commitTradePrimaryTabRoute } from "@/lib/trade/tabs/commit-trade-primary-tab-route";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { I18N_COMPACT_CHIP_LABEL } from "@/lib/ui/i18n-compact-label-classes";

/** PRIMARY host inner — column + gutter; never `APP_MAIN_HEADER_INNER` (overflow-x-hidden). */
const TRADE_PRIMARY_INNER_CLASS = `${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`;

interface TradePrimaryTabsProps {
  embed?: boolean;
  embedInAppHeader?: boolean;
  /** @deprecated — 전역 `sam-tab` 단일 규칙만 사용 */
  appearance?: "pill" | "inline-text" | "community" | "orders-tab";
}

function TradePrimaryTabsFallback({ embedInAppHeader }: { embedInAppHeader: boolean }) {
  const skeleton = (
    <div
      className="flex h-[length:var(--dibay-secondary-tab-row-h,44px)] min-w-0 max-w-full items-center gap-[length:var(--dibay-secondary-tab-gap,8px)]"
      aria-hidden
    >
      <span className="inline-flex min-h-8 min-w-16 shrink-0 animate-pulse rounded-full border border-sam-border bg-sam-surface-muted px-2.5 py-1" />
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
        <span className="inline-flex min-h-8 min-w-20 animate-pulse rounded-full border border-sam-border bg-sam-surface-muted px-2.5 py-1" />
        <span className="inline-flex min-h-8 min-w-16 animate-pulse rounded-full border border-sam-border bg-sam-surface-muted px-2.5 py-1" />
      </div>
    </div>
  );
  if (!embedInAppHeader) {
    return (
      <div
        className={`relative flex min-w-0 flex-shrink-0 flex-col border-b border-[color:var(--dibay-domain-divider,var(--sector-header-border))] ${DIBAY_CHROME_SECONDARY_HOST_CLASS}`}
        data-dibay-nav="secondary"
      >
        <div className={TRADE_PRIMARY_INNER_CLASS}>{skeleton}</div>
      </div>
    );
  }
  return (
    <div className={DIBAY_CHROME_SECONDARY_HOST_CLASS} data-dibay-nav="secondary">
      <div className={TRADE_PRIMARY_INNER_CLASS}>{skeleton}</div>
    </div>
  );
}

/**
 * TRADE 메뉴 탭(전체·카테고리…) — `RegionBar` 아래. `sam-tabs` / `sam-tabs--scroll` 단일 시각.
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
  const { loading: _loading, error, tabs, activeIndex: pathnameActiveIndex } = useTradeTabs(pathname);
  const [allSortOpen, setAllSortOpen] = useState(false);
  const [allSortMenuPos, setAllSortMenuPos] = useState<{ top: number; left: number } | null>(null);
  const allSortButtonRef = useRef<HTMLButtonElement | null>(null);
  const allSortMenuRef = useRef<HTMLUListElement | null>(null);
  const tradeStateRaw = searchParams.get("tradeState")?.trim() ?? "";
  const tradeState = tradeStateRaw === "active" || tradeStateRaw === "reserved" || tradeStateRaw === "sold"
    ? tradeStateRaw
    : "latest";
  const allSortLabel =
    tradeState === "active"
      ? safeT("trade_market_sort_active")
      : tradeState === "reserved"
        ? safeT("trade_market_sort_reserved")
        : tradeState === "sold"
          ? safeT("trade_market_sort_sold")
          : safeT("trade_market_sort_latest");
  const tradeSortOptions = useMemo(
    () =>
      [
        { key: "latest" as const, label: safeT("trade_market_sort_latest") },
        { key: "active" as const, label: safeT("trade_market_sort_active") },
        { key: "reserved" as const, label: safeT("trade_market_sort_reserved") },
        { key: "sold" as const, label: safeT("trade_market_sort_sold") },
      ],
    [safeT]
  );
  const allTradeHref = tradeState === "latest" ? "/market" : `/market?tradeState=${encodeURIComponent(tradeState)}`;
  const setTradeState = useCallback(
    (next: "latest" | "active" | "reserved" | "sold") => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next === "latest") sp.delete("tradeState");
      else sp.set("tradeState", next);
      const qs = sp.toString();
      /** 현재 1차 카테고리 경로·topic 등 유지 — 해당 카테고리 전체 목록에 tradeState 적용 */
      const nextHref = qs ? `${pathname}?${qs}` : pathname;
      if (next === tradeState) {
        setAllSortOpen(false);
        return;
      }
      if (!guardBeforeNavigate(nextHref)) return;
      beginMenuNavigation(nextHref, "trade-primary");
      void router.replace(nextHref, { scroll: false });
      setAllSortOpen(false);
    },
    [beginMenuNavigation, router, searchParams, pathname, tradeState, guardBeforeNavigate]
  );
  /** navigation 중에는 pathname 기반 `isActive`와 intent 기반 하이라이트가 동시에 켜져 옆 탭까지 선택처럼 보임 → trade-primary pending 일 때는 intent만 신뢰 */
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
    if (allSortOpen) {
      setAllSortOpen(false);
    } else {
      updateAllSortMenuPos();
      setAllSortOpen(true);
    }
  }, [allSortOpen, updateAllSortMenuPos]);

  useLayoutEffect(() => {
    const activeTab = displayTabs.find((t) => t.isDisplayActive);
    const el = activeTab ? tabRefs.current[activeTab.key] : null;
    if (el) {
      el.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [displayTabs]);

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

  const errorBlock = (
    <p className={`${Sam.text.bodySecondary} py-3 text-sam-danger`} role="alert">
      {error}
    </p>
  );

  const onAllTrade =
    pendingMenuIntent?.source === "trade-primary"
      ? menuHrefMatchesIntent(allTradeHref, pendingMenuIntent)
      : menuHrefMatchesIntent(allTradeHref, pendingMenuIntent) || pathname === "/market";

  const categoryTabs = displayTabs.filter((tab) => tab.key !== "all");

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
      className={`${tradePrimaryTabClass(onAllTrade)} inline-flex shrink-0 items-center gap-1`}
    >
      <span className={`relative z-[1] ${I18N_COMPACT_CHIP_LABEL}`}>{allSortLabel}</span>
      {allSortOpen ? (
        <ChevronUp className="relative z-[1] h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
      ) : (
        <ChevronDown className="relative z-[1] h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
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
                  onClick={() => setTradeState(opt.key as "latest" | "active" | "reserved" | "sold")}
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

  /** Community parity: sort chip fixed; category strip scrolls alone. */
  const scrollBody =
    error ? errorBlock : (
      <div
        className="flex h-[length:var(--dibay-secondary-tab-row-h,44px)] min-w-0 max-w-full items-center gap-[length:var(--dibay-secondary-tab-gap,8px)]"
        role="tablist"
        aria-label={t("trade_138")}
      >
        {allSortChip}
        <HorizontalDragScroll
          className={`${DIBAY_SECONDARY_TABS_CLASS} min-w-0 flex-1 border-b-0 bg-transparent px-0`}
          style={{ WebkitOverflowScrolling: "touch" }}
          role="presentation"
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
                });
              }}
            >
              <span className={`relative z-[1] ${I18N_COMPACT_CHIP_LABEL}`}>{tab.label}</span>
            </Link>
          ))}
        </HorizontalDragScroll>
      </div>
    );

  if (embedInAppHeader) {
    return (
      <div className={DIBAY_CHROME_SECONDARY_HOST_CLASS} data-dibay-nav="secondary">
        <div className={TRADE_PRIMARY_INNER_CLASS}>{scrollBody}</div>
        {allSortMenuPortal}
      </div>
    );
  }

  return (
    <div
      className={`relative flex min-w-0 flex-shrink-0 flex-col border-b border-[color:var(--dibay-domain-divider,var(--sector-header-border))] ${DIBAY_CHROME_SECONDARY_HOST_CLASS}`}
      data-dibay-nav="secondary"
    >
      <div className={TRADE_PRIMARY_INNER_CLASS}>{scrollBody}</div>
      {allSortMenuPortal}
    </div>
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
