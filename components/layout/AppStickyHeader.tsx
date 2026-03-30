"use client";

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
  const topTier1RuleSet = getMobileTopTier1RuleSet(pathname);
  const extrasOpt = useMainTier1ExtrasOptional();
  const extras = extrasOpt?.extras ?? null;
  /** 거래 1·2단 탭(필요 시 2단만) — `/mypage/trade` 는 허브 자체 내비가 있어 TRADE 탭 스택 숨김 */
  const isTradeMenuSurface =
    pathname === "/home" || (pathname?.startsWith("/market/") ?? false);
  const hideRegionBar = !topTier1RuleSet.showRegionBar;

  /** 빈 `sticky z-20` 래퍼는 아래 본문 스티키(채팅 허브 등)와 쌓임이 꼬여 가릴 수 있음 */
  if (hideRegionBar) return null;

  const ctaLinks = extras?.ctaLinks ?? [];
  const stickyBelow = extras?.stickyBelow ?? null;

  return (
    <div className="sticky top-0 z-20 w-full min-w-0 max-w-full overflow-x-hidden bg-[var(--sub-bg)]">
      {categorySticky ? (
          <div className="border-b border-gray-200 bg-white">
            <RegionBar embedded />
            <CategoryListSubheader
              backHref={categorySticky.backHref}
              category={categorySticky.category}
              showTypeBadge={categorySticky.showTypeBadge}
            />
          </div>
        ) : (
          <>
            <RegionBar />
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
