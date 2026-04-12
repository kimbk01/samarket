"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  APP_MARKET_MENU_TEXT_ACTIVE,
  APP_MARKET_MENU_TEXT_BASE,
  APP_MARKET_MENU_TEXT_INACTIVE,
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { HomeCategoryChip } from "@/components/home/HomeCategoryChip";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import {
  TRADE_PRIMARY_COMMUNITY_ROW1_SCROLL_NAV_CLASS,
  TRADE_PRIMARY_INLINE_SCROLL_NAV_CLASS,
  TRADE_PRIMARY_TABS_EMBED_SCROLL_SHELL_CLASS,
  TRADE_PRIMARY_TABS_OUTER_SCROLL_CLASS,
  TRADE_PRIMARY_TABS_ROW_CLASS,
  TRADE_PRIMARY_TABS_STICKY_FALLBACK_SHELL_CLASS,
} from "@/lib/trade/ui/trade-primary-tabs-classes";
import { useSwipeTabNavigation } from "@/lib/ui/use-swipe-tab-navigation";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

interface TradePrimaryTabsProps {
  embed?: boolean;
  embedInAppHeader?: boolean;
  appearance?: "pill" | "inline-text" | "community" | "orders-tab";
}

/**
 * TRADE **메뉴 탭** (전체·중고거래·…) — **메인 1단**(`RegionBar`) 아래 줄. 용어: `lib/layout/main-tier1.ts`
 */
export function TradePrimaryTabs({
  embed = false,
  embedInAppHeader = false,
  appearance = "pill",
}: TradePrimaryTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const tabsOuterRef = useRef<HTMLDivElement | null>(null);
  const tabsInnerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [tabsFit, setTabsFit] = useState(false);
  const { tradeCategories, loading, error, tabs, activeIndex } = useTradeTabs(pathname);

  /** 거래 1단 탭 전환 체감 — 마운트 직후 비활성 탭 RSC 선로딩 */
  useEffect(() => {
    if (loading || tabs.length < 2) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      for (const tab of tabs) {
        if (tab.href && !tab.isActive) {
          void router.prefetch(tab.href);
        }
      }
    }, 450);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [loading, tabs, router]);

  /** `/home`·`/market/*` 동일: 앱 헤더 안에서는 `/market/trade` 와 같은 1단(밑줄·회색 띠) 규칙 */
  const useCommunityRow1 = appearance === "community";
  const useTradePrimaryRow = appearance === "orders-tab" || embedInAppHeader;

  const updateIndicator = useCallback(() => {
    const inner = tabsInnerRef.current;
    const activeTab = tabs.find((tab) => tab.isActive);
    const activeEl = activeTab ? tabRefs.current[activeTab.key] : null;
    if (!inner || !activeEl) {
      setIndicator({ left: 0, width: 0 });
      return;
    }
    setIndicator({
      left: activeEl.offsetLeft,
      width: activeEl.offsetWidth,
    });
  }, [tabs]);

  const updateLayoutMode = useCallback(() => {
    const outer = tabsOuterRef.current;
    const inner = tabsInnerRef.current;
    if (!outer || !inner) return;
    setTabsFit(inner.scrollWidth <= outer.clientWidth + 1);
  }, []);

  useLayoutEffect(() => {
    if (!useTradePrimaryRow) return;
    updateLayoutMode();
    updateIndicator();
    const outer = tabsOuterRef.current;
    const inner = tabsInnerRef.current;
    const activeTab = tabs.find((tab) => tab.isActive);
    const activeEl = activeTab ? tabRefs.current[activeTab.key] : null;
    if (activeEl) {
      activeEl.scrollIntoView({ inline: "center", block: "nearest" });
    }
    const ro = new ResizeObserver(() => {
      updateLayoutMode();
      updateIndicator();
    });
    if (outer) ro.observe(outer);
    if (inner) ro.observe(inner);
    const onResize = () => {
      updateLayoutMode();
      updateIndicator();
    };
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [tabs, updateIndicator, updateLayoutMode, useTradePrimaryRow]);

  const onSelectTab = useCallback(
    (href: string) => {
      router.push(href, { scroll: false });
    },
    [router]
  );
  const { onTouchStart, onTouchEnd } = useSwipeTabNavigation(tabs, activeIndex, onSelectTab);

  if (loading) {
    const loadingInner = (
      <div className={embedInAppHeader ? "flex h-[55px] items-center overflow-x-auto" : "flex gap-2 overflow-x-auto pb-3 pt-1"}>
        <span
          className={
            appearance === "inline-text"
              ? `${APP_MARKET_MENU_TEXT_BASE} text-sam-meta`
              : appearance === "orders-tab" || embedInAppHeader
                ? "shrink-0 text-[14px] font-medium text-sam-meta sm:text-[15px]"
                : `${APP_TOP_MENU_ROW1_BASE} bg-sam-surface-muted text-sam-meta`
          }
        >
          로딩…
        </span>
      </div>
    );
    if (embedInAppHeader) {
      return (
        <div className="border-b border-sam-border bg-sam-surface-muted">
          <div className={APP_MAIN_HEADER_INNER_CLASS}>{loadingInner}</div>
        </div>
      );
    }
    return loadingInner;
  }

  if (error) {
    const errInner = <div className="pb-2 text-[13px] text-red-500">{error}</div>;
    if (embedInAppHeader) {
      return (
        <div className="border-b border-sam-border bg-sam-surface-muted">
          <div className={APP_MAIN_HEADER_INNER_CLASS}>{errInner}</div>
        </div>
      );
    }
    return errInner;
  }

  const row1AllClass =
    appearance === "inline-text"
      ? `${APP_MARKET_MENU_TEXT_BASE} ${pathname === "/home" ? APP_MARKET_MENU_TEXT_ACTIVE : APP_MARKET_MENU_TEXT_INACTIVE}`
      : useTradePrimaryRow
        ? [
            "flex h-[55px] shrink-0 items-center justify-center whitespace-nowrap px-1 text-center text-[14px] leading-snug transition-colors duration-200 sm:px-1.5 sm:text-[15px]",
            pathname === "/home" ? "font-semibold text-sam-fg" : "font-medium text-sam-muted hover:text-sam-fg",
          ].join(" ")
        : `${APP_TOP_MENU_ROW1_BASE} ${pathname === "/home" ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE}`;

  const emptyClass =
    appearance === "inline-text"
      ? `${APP_MARKET_MENU_TEXT_BASE} text-sam-meta`
      : useTradePrimaryRow
        ? "flex h-[55px] shrink-0 items-center whitespace-nowrap text-[14px] font-medium text-sam-meta sm:text-[15px]"
        : `${APP_TOP_MENU_ROW1_BASE} bg-sam-surface-muted text-sam-muted`;

  const inner = (
    <>
      <Link href="/home" className={row1AllClass}>
        전체
      </Link>
      {tradeCategories.length === 0 ? (
        <span className={emptyClass}>카테고리가 없습니다</span>
      ) : (
        tradeCategories.map((category) => (
          <HomeCategoryChip
            key={category.id}
            category={category}
            appearance={
              useTradePrimaryRow
                ? "orders-tab"
                : useCommunityRow1
                  ? "pill"
                  : appearance === "inline-text"
                    ? "inline-text"
                    : "pill"
            }
          />
        ))
      )}
    </>
  );

  if (appearance === "inline-text") {
    return (
      <HorizontalDragScroll
        className={TRADE_PRIMARY_INLINE_SCROLL_NAV_CLASS}
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label="TRADE 메뉴"
      >
        {inner}
      </HorizontalDragScroll>
    );
  }

  if (useCommunityRow1) {
    return (
      <HorizontalDragScroll
        className={TRADE_PRIMARY_COMMUNITY_ROW1_SCROLL_NAV_CLASS}
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label="TRADE 메뉴"
      >
        {inner}
      </HorizontalDragScroll>
    );
  }

  if (useTradePrimaryRow) {
    return (
      <div className="min-w-0 overflow-x-hidden border-t border-sam-fg/[0.08] bg-sam-surface-muted">
        <div className={APP_MAIN_HEADER_INNER_CLASS}>
          <div
            ref={tabsOuterRef}
            className={TRADE_PRIMARY_TABS_OUTER_SCROLL_CLASS}
            style={{ WebkitOverflowScrolling: "touch" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div
              ref={tabsInnerRef}
              className={`relative ${TRADE_PRIMARY_TABS_ROW_CLASS} ${
                tabsFit ? "w-full min-w-0 justify-between gap-0" : "w-max min-w-full gap-4"
              }`}
            >
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={tab.href}
                  ref={(el) => {
                    tabRefs.current[tab.key] = el;
                  }}
                  className={[
                    tabsFit
                      ? "flex h-[55px] min-w-0 flex-1 items-center justify-center px-1 text-center text-[14px] leading-snug transition-colors duration-200 sm:px-1.5 sm:text-[15px]"
                      : "flex h-[55px] shrink-0 items-center justify-center whitespace-nowrap px-1 text-center text-[14px] leading-snug transition-colors duration-200 sm:px-1.5 sm:text-[15px]",
                    tab.isActive
                      ? "font-semibold text-sam-fg"
                      : "font-medium text-sam-muted hover:text-sam-fg",
                  ].join(" ")}
                  aria-current={tab.isActive ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              ))}
              <div
                className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-sam-ink transition-[left,width] duration-300 ease-out"
                style={{ left: indicator.left, width: indicator.width }}
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const shellClass = embed
    ? embedInAppHeader
      ? `${TRADE_PRIMARY_TABS_EMBED_SCROLL_SHELL_CLASS} border-b border-sam-border-soft py-2 ${APP_MAIN_HEADER_INNER_CLASS}`
      : `${TRADE_PRIMARY_TABS_EMBED_SCROLL_SHELL_CLASS} px-0 py-1`
    : TRADE_PRIMARY_TABS_STICKY_FALLBACK_SHELL_CLASS;

  return <div className={shellClass}>{inner}</div>;
}
