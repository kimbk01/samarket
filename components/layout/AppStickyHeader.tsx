"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { CategoryListSubheader } from "@/components/category/CategoryListSubheader";
import {
  useCategoryListStickyConfig,
  useTradeSecondaryTabs,
} from "@/contexts/CategoryListHeaderContext";
import { TradePrimaryTabs } from "@/components/trade/TradePrimaryTabs";
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { MyManagedCtaStrip } from "@/components/my/MyManagedCtaStrip";
import { RegionBar } from "./RegionBar";

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
      pathname === "/home" ||
      pathname === "/market" ||
      (pathname?.startsWith("/market/") ?? false);
    return { topTier1RuleSet, isTradeMenuSurface };
  }, [pathname]);
  const extrasOpt = useMainTier1ExtrasOptional();
  const extras = extrasOpt?.extras ?? null;
  const hideRegionBar = !topTier1RuleSet.showRegionBar;

  /** 빈 `sticky z-20` 래퍼는 아래 본문 스티키(채팅 허브 등)와 쌓임이 꼬여 가릴 수 있음 */
  if (hideRegionBar) return null;

  const ctaLinks = extras?.ctaLinks ?? [];
  const stickyBelow = extras?.stickyBelow ?? null;

  return (
    <div
      data-app-sticky-header
      className="sticky top-0 z-20 w-full min-w-0 max-w-full overflow-x-hidden bg-sam-surface/95 backdrop-blur-[10px]"
    >
      {categorySticky ? (
          <div className="border-b border-sam-border bg-sam-surface/95">
            <RegionBar embedded tier1RuleSet={topTier1RuleSet} />
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
                <TradePrimaryTabs embed embedInAppHeader />
                {tradeSecondaryTabs}
              </>
            ) : null}
          </>
        )}
    </div>
  );
}
