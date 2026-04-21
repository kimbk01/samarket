"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { useSwipeTabNavigation } from "@/lib/ui/use-swipe-tab-navigation";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

interface TradePrimaryTabsProps {
  embed?: boolean;
  embedInAppHeader?: boolean;
  /** @deprecated — 전역 `sam-tab` 단일 규칙만 사용 */
  appearance?: "pill" | "inline-text" | "community" | "orders-tab";
}

/**
 * TRADE 메뉴 탭(전체·카테고리…) — `RegionBar` 아래. `sam-tabs` / `sam-tabs--scroll` 단일 시각.
 */
export function TradePrimaryTabs({
  embed = false,
  embedInAppHeader = false,
}: TradePrimaryTabsProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const { loading, error, tabs, activeIndex } = useTradeTabs(pathname);

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

  const onSelectTab = useCallback(
    (href: string) => {
      router.push(href, { scroll: false });
    },
    [router]
  );
  const { onTouchStart, onTouchEnd } = useSwipeTabNavigation(tabs, activeIndex, onSelectTab);

  useLayoutEffect(() => {
    const activeTab = tabs.find((t) => t.isActive);
    const el = activeTab ? tabRefs.current[activeTab.key] : null;
    if (el) {
      el.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [tabs]);

  if (!embed && !embedInAppHeader) {
    return null;
  }

  const loadingBlock = (
    <p className={`${Sam.text.bodySecondary} py-3`} aria-live="polite">
      로딩…
    </p>
  );

  const errorBlock = (
    <p className={`${Sam.text.bodySecondary} py-3 text-sam-danger`} role="alert">
      {error}
    </p>
  );

  const scrollBody =
    loading ? loadingBlock : error ? errorBlock : (
      <HorizontalDragScroll
        className={`${Sam.tabs.barScroll} min-w-0 max-w-full`}
        style={{ WebkitOverflowScrolling: "touch" }}
        role="tablist"
        aria-label="TRADE 메뉴"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            ref={(el) => {
              tabRefs.current[tab.key] = el;
            }}
            role="tab"
            aria-selected={tab.isActive}
            prefetch={tab.key !== "all"}
            className={tab.isActive ? Sam.tabs.tabActive : Sam.tabs.tab}
          >
            {tab.label}
          </Link>
        ))}
      </HorizontalDragScroll>
    );

  if (embedInAppHeader) {
    return (
      <div className="min-w-0 overflow-x-hidden border-t border-sam-border-soft bg-sam-surface-muted">
        <div className={APP_MAIN_HEADER_INNER_CLASS}>{scrollBody}</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-shrink-0 flex-col overflow-x-hidden border-b border-sam-border bg-sam-surface-muted py-1">
      <div className={APP_MAIN_HEADER_INNER_CLASS}>{scrollBody}</div>
    </div>
  );
}
