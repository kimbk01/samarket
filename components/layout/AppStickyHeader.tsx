"use client";

import dynamic from "next/dynamic";
import { isTradeSearchPath } from "@/lib/trade/search/trade-search-paths";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTradeSecondaryTabs } from "@/contexts/CategoryListHeaderContext";

/**
 * 거래 2단 탭은 늦게 불러온다 — 불러오는 동안 같은 크기의 자리(`DibaySecondaryTabRowSkeleton`)를 그려
 * 아래 3단 전환 줄이 2단 자리에 먼저 그려졌다가 밀려 내려가지 않게 한다 (운영 실측 63→107px, Owner 「3건 수정」 2026-11-12).
 * 거래 머리글엔 항상 3단 전환 줄이 아래에 붙으므로 자리도 구분선 포함(45px).
 */
const TradePrimaryTabs = dynamic(
  () => import("@/components/trade/TradePrimaryTabs").then((m) => m.TradePrimaryTabs),
  { ssr: false, loading: () => <DibaySecondaryTabRowSkeleton bordered /> }
);
import {
  getMobileTopTier1RuleSet,
  resolveCommunityTradeSwitchHub,
} from "@/lib/layout/mobile-top-tier1-rules";
import { CommunityTradeSwitchRow } from "@/components/layout/CommunityTradeTitleSwitch";
import { DibaySecondaryTabRowSkeleton } from "@/components/ui/DibaySecondaryTabRowSkeleton";
import { mainTier1ExtrasForPathname, useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { MyManagedCtaStrip } from "@/components/my/MyManagedCtaStrip";
import { isDeliveryConsumerPath } from "@/lib/design/delivery-chrome";
import {
  dibayDomainChromeCssVarsForId,
  useDibayDomainChromeId,
} from "@/lib/ui/dibay-domain-chrome";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { RegionBar } from "./RegionBar";
import { TradeMarketPullRefreshHint } from "@/components/trade/TradeMarketPullRefreshHint";
import { TradeMarketPullRefreshHost } from "@/components/trade/TradeMarketPullRefreshHost";
import { MarketplaceHomeEntryChrome } from "@/components/trade/MarketplaceHomeEntryChrome";
import { StoresHomePullRefreshHost } from "@/components/stores/home/hub/StoresHomePullRefreshHost";
import { StoresBrowsePullRefreshHost } from "@/components/stores/browse/StoresBrowsePullRefreshHost";
import { isCustomerCommerceHubPath } from "@/lib/delivery/customer/commerce-hub-nav";

const CustomerCommerceHubPrimaryTabs = dynamic(
  () =>
    import("@/components/orders/customer-commerce/CustomerCommerceHubPrimaryTabs").then(
      (m) => m.CustomerCommerceHubPrimaryTabs
    ),
  { ssr: false }
);

/**
 * 전역 스티키 헤더 스택 — **메인 1단**(`RegionBar`) + (거래 화면일 때) TRADE 메뉴·2단 카테고리.
 * Domain pale surface via useDibayDomainChromeId (하단 탭 색 · 공용 화면은 들어온 탭 색, visual only).
 */
export function AppStickyHeader() {
  const pathname = usePathname();
  const isMessengerSplit = useIsMessengerSplitViewport();
  const tradeSecondaryTabs = useTradeSecondaryTabs();
  /** tier1 규칙 + 거래 탭 스택 노출 여부를 pathname 당 한 번에 계산 */
  /** 헤더 SSOT 3단계 — 하단 탭 색 · 공용 화면은 들어온 탭 색 */
  const domainId = useDibayDomainChromeId(pathname);
  const domainStyle = useMemo(() => dibayDomainChromeCssVarsForId(domainId), [domainId]);
  const { topTier1RuleSet, isTradeMenuSurface, communityTradeSwitchHub } = useMemo(() => {
    const topTier1RuleSet = getMobileTopTier1RuleSet(pathname);
    const pathNoQueryForSurface = (pathname ?? "").split("?")[0] ?? "";
    /** Browse-only chrome — sell hub / location stack are not marketplace list surfaces. */
    const isTradeMenuSurface =
      pathNoQueryForSurface === "/market" ||
      (pathNoQueryForSurface.startsWith("/market/") &&
        pathNoQueryForSurface !== "/market/sell" &&
        !pathNoQueryForSurface.startsWith("/market/sell/") &&
        pathNoQueryForSurface !== "/market/location" &&
        !pathNoQueryForSurface.startsWith("/market/location/") &&
        !isTradeSearchPath(pathNoQueryForSurface));
    return {
      topTier1RuleSet,
      isTradeMenuSurface,
      communityTradeSwitchHub: resolveCommunityTradeSwitchHub(pathname, topTier1RuleSet),
    };
  }, [pathname]);
  const extrasOpt = useMainTier1ExtrasOptional();
  const extras = mainTier1ExtrasForPathname(extrasOpt?.extras, pathname);
  const hideRegionBar = !topTier1RuleSet.showRegionBar;
  const isCommunityMessengerSurface =
    pathname === "/community-messenger" || (pathname?.startsWith("/community-messenger/") ?? false);
  /**
   * ≥768 메신저: `RegionBar` 가 null 이어도 이 래퍼가 `pt-[var(--safe-top)]` 만 남겨
   * `MessengerSplitTopBar` 와 이중 inset 이 됨 (Android tablet CDP: stickyH≈29, children=0).
   * SplitTopBar 가 safe-top 단일 담당.
   */
  if (isMessengerSplit && isCommunityMessengerSurface) return null;

  /** 허브·피드: `MainHubScrollColumn` 헤더 슬롯 — 스크롤 밖 `shrink-0` (상단·업종 탭 항상 노출) */
  if (hideRegionBar) return null;

  const ctaLinks = extras?.ctaLinks ?? [];
  const stickyBelow = extras?.stickyBelow ?? null;
  const deliveryChrome = isDeliveryConsumerPath(pathname);
  const pathNoQuery = (pathname ?? "").split("?")[0] ?? "";
  const isStoresHubRoot = pathNoQuery === "/stores" || pathNoQuery === "/stores/";
  const isStoresBrowse = pathNoQuery.startsWith("/stores/browse/");
  const isCommerceHub = isCustomerCommerceHubPath(pathNoQuery);

  return (
    <div
      data-app-sticky-header
      data-dibay-domain={domainId}
      style={domainStyle}
      /**
       * `pt-[var(--safe-top)]`: status bar / notch — SSOT `app/app-shell.css` `--safe-top`.
       */
      className={`relative z-20 w-full min-w-0 max-w-full shrink-0 overflow-x-clip pt-[var(--safe-top)] ${
        deliveryChrome
          ? "delivery-ui bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]"
          : "bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))] backdrop-blur-[10px] border-b border-[color:var(--dibay-domain-divider,var(--sector-header-border))]"
      }`}
    >
      <RegionBar tier1RuleSet={topTier1RuleSet} />
      {ctaLinks.length > 0 ? <MyManagedCtaStrip links={ctaLinks} /> : null}
      {stickyBelow ??
        (communityTradeSwitchHub === "community" || communityTradeSwitchHub === "moim" ? (
          /**
           * 커뮤니티 2단·3단은 피드(`CommunityFeed`)가 붙은 뒤 `stickyBelow` 로 들어온다 — 그 전 첫 화면부터
           * 2단 자리 + 3단 전환 줄을 같은 크기로 미리 그려 본문이 늦게 밀려 내려가지 않게 한다
           * (운영 실측 본문 53→143px, Owner 「3건 수정」 2026-11-12). 피드가 붙으면 같은 자리를 그대로 이어받는다.
           */
          <>
            <DibaySecondaryTabRowSkeleton bordered />
            <CommunityTradeSwitchRow active={communityTradeSwitchHub} />
          </>
        ) : null)}
      {isTradeMenuSurface ? (
        <>
          <TradeMarketPullRefreshHost />
          <TradeMarketPullRefreshHint />
          <MarketplaceHomeEntryChrome />
          <TradePrimaryTabs
            embed
            embedInAppHeader
            dividerBelow={communityTradeSwitchHub === "trade"}
            locationInTitle={communityTradeSwitchHub === "trade"}
          />
          {/* 머리글 3단 — 「정보교환 · 거래」 전환 탭 오른쪽 정렬 (Owner 「A 안」 2026-11-12, 1단에서 옮김) */}
          {communityTradeSwitchHub === "trade" ? <CommunityTradeSwitchRow active="trade" /> : null}
          {tradeSecondaryTabs}
        </>
      ) : null}
      {/* 내정보 쿠폰·상품권은 각각 한 화면 — 주문 내역·매장 신청 탭을 섞지 않는다 (내정보 분류 설계 2026-11-02) */}
      {isCommerceHub && !pathNoQuery.startsWith("/mypage/") ? <CustomerCommerceHubPrimaryTabs /> : null}
      {/* 배달 메뉴 구성 — 홈 상단 탭·아이콘 판은 본문(`DeliveryHomeMenuBoard`)과 함께 스크롤 (헤더엔 주소·검색창만) */}
      {isStoresHubRoot ? <StoresHomePullRefreshHost /> : null}
      {isStoresBrowse ? <StoresBrowsePullRefreshHost /> : null}
    </div>
  );
}
