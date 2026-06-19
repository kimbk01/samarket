"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { CategoryListSubheader } from "@/components/category/CategoryListSubheader";
import {
  useCategoryListStickyConfig,
  useTradeSecondaryTabs,
} from "@/contexts/CategoryListHeaderContext";

const TradePrimaryTabs = dynamic(
  () => import("@/components/trade/TradePrimaryTabs").then((m) => m.TradePrimaryTabs),
  { ssr: false }
);
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { MyManagedCtaStrip } from "@/components/my/MyManagedCtaStrip";
import { isDeliveryConsumerPath } from "@/lib/design/delivery-chrome";
import { RegionBar } from "./RegionBar";
import { TradeMarketPullRefreshHint } from "@/components/trade/TradeMarketPullRefreshHint";
import { TradeMarketPullRefreshHost } from "@/components/trade/TradeMarketPullRefreshHost";

/**
 * 전역 스티키 헤더 스택 — **메인 1단**(`RegionBar`) + (거래 화면일 때) TRADE 메뉴·2단 카테고리.
 * 메인 1단 단일 출처·용어: `lib/layout/main-tier1.ts`
 */
export function AppStickyHeader() {
  const pathname = usePathname();
  const categorySticky = useCategoryListStickyConfig();
  const tradeSecondaryTabs = useTradeSecondaryTabs();
  /** tier1 규칙 + 거래 탭 스택 노출 여부를 pathname 당 한 번에 계산 */
  const { topTier1RuleSet, isTradeMenuSurface } = useMemo(() => {
    const topTier1RuleSet = getMobileTopTier1RuleSet(pathname);
    const isTradeMenuSurface =
      pathname === "/market" ||
      (pathname?.startsWith("/market/") ?? false);
    return { topTier1RuleSet, isTradeMenuSurface };
  }, [pathname]);
  const extrasOpt = useMainTier1ExtrasOptional();
  const extras = extrasOpt?.extras ?? null;
  const hideRegionBar = !topTier1RuleSet.showRegionBar;

  /** 허브·피드: `MainHubScrollColumn` 헤더 슬롯 — 스크롤 밖 `shrink-0` (상단·업종 탭 항상 노출) */
  if (hideRegionBar) return null;

  const ctaLinks = extras?.ctaLinks ?? [];
  const stickyBelow = extras?.stickyBelow ?? null;
  const deliveryChrome = isDeliveryConsumerPath(pathname);

  return (
    <div
      data-app-sticky-header
      /**
       * `pt-[var(--safe-top)]`: status bar / notch — SSOT `app/app-shell.css` `--safe-top`.
       */
      className={`relative z-20 w-full min-w-0 max-w-full shrink-0 overflow-x-clip pt-[var(--safe-top)] ${
        deliveryChrome
          ? "delivery-ui bg-[color:var(--sector-header-bg,var(--delivery-header-bar-bg))]"
          : "bg-[color:var(--sector-header-bg)] backdrop-blur-[10px] border-b border-[color:var(--sector-header-border)]"
      }`}
    >
      {categorySticky ? (
          <div className="border-b border-sam-border bg-sam-surface/95">
            <RegionBar tier1RuleSet={topTier1RuleSet} />
            <CategoryListSubheader
              backHref={categorySticky.backHref}
              category={categorySticky.category}
              showTypeBadge={categorySticky.showTypeBadge}
            />
          </div>
        ) : (
          <>
            <RegionBar tier1RuleSet={topTier1RuleSet} />
            {ctaLinks.length > 0 ? <MyManagedCtaStrip links={ctaLinks} /> : null}
            {stickyBelow}
            {isTradeMenuSurface ? (
              <>
                <TradeMarketPullRefreshHost />
                <TradeMarketPullRefreshHint />
                <TradePrimaryTabs embed embedInAppHeader />
                {tradeSecondaryTabs}
              </>
            ) : null}
          </>
        )}
    </div>
  );
}
