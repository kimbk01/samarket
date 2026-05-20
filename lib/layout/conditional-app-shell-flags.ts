import {
  MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS,
  MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import {
  getMobileTopTier1RuleSet,
  isTradeFloatingMenuSurface,
} from "@/lib/layout/mobile-top-tier1-rules";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import { isStoreCommerceCartCheckoutPath } from "@/lib/stores/store-cart-page-layout";
import { isStoresConsumerSlugMenuRoute } from "@/lib/stores/store-consumer-route";

/** 통화 전용 라우트에서 수신 오버레이 억제 — `CallIncomingChrome` 등 경량 판별용 */
export function resolveSuppressIncomingCallOverlay(pathname: string | null): boolean {
  return (
    Boolean(pathname?.match(/^\/community-messenger\/calls\/[^/]+$/)) &&
    pathname !== "/community-messenger/calls/outgoing"
  );
}

/** 커뮤니티 메신저 채팅방 — 메인 하단 탭(`BottomNav`)을 같이 쓰는 화면 */
export function isCommunityMessengerRoomPathname(pathname: string | null): boolean {
  return Boolean(pathname?.match(/^\/community-messenger\/rooms\/[^/]+\/?$/));
}

/**
 * 거래 탭 허브(`/market`, `/market/…`) — 하단 `HomeTradeHubFloatingBar` 대신 상단 `+`만 사용.
 * `/market/trade-meet-spot` 는 지도 전용이라 제외(해당 화면은 플로팅 바 자체가 마운트되지 않음).
 */
export function isMarketTradeFeedHubPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]!.trim();
  if (!p) return false;
  if (p === "/market/trade-meet-spot" || p.startsWith("/market/trade-meet-spot/")) return false;
  return p === "/market" || p.startsWith("/market/");
}

export type ConditionalAppShellResolvedFlags = {
  /** `/stores/[slug]` 주문 메뉴 루트 — 히어로 풀블리드·당김 배경과 셸 배경 일치 */
  isStoreOrderHeroMenuSurface: boolean;
  isSettings: boolean;
  isLogout: boolean;
  isMyEdit: boolean;
  isProductEditPage: boolean;
  isPersonalProductComposerPage: boolean;
  isWritePage: boolean;
  isPostDetail: boolean;
  isProductDetail: boolean;
  isStoreProductDetail: boolean;
  isStoreSection: boolean;
  isMypageTradeChatRoom: boolean;
  isCommunityMessengerRoom: boolean;
  isCommunityMessengerCallPage: boolean;
  suppressIncomingCallOverlay: boolean;
  isAddressMapSelect: boolean;
  isViewportLockedChatDetail: boolean;
  isAnyChatRoomDetail: boolean;
  appShellRootClass: string;
  isChatRoomDetail: boolean;
  isSearch: boolean;
  isServicesSection: boolean;
  isCommunityApp: boolean;
  isCommunityMessengerSurface: boolean;
  isOrdersHub: boolean;
  isTradeFloatingSurface: boolean;
  /** `/mypage/purchases` 등 — 하단 `HomeTradeHubFloatingBar` 표시( `/market` 허브는 false ) */
  showHomeTradeHubFloatingBar: boolean;
  /** `/market/trade-meet-spot` — 전역 하단 탭·플로팅 FAB 숨김 */
  isTradeMeetSpotPickRoute: boolean;
  isChatsHubSurface: boolean;
  hideBarAndFloat: boolean;
  hideRegionBar: boolean;
  isMyTab: boolean;
  isMypageHub: boolean;
  showFloat: boolean;
  showBottomNav: boolean;
  showOwnerLiteStoreBar: boolean;
  mountGlobalRealtimeChromeOnTradeOrStoreDetail: boolean;
  mountGlobalRealtimeChrome: boolean;
  mountNotificationSoundPrime: boolean;
  mountPhilifeWarmPrefetch: boolean;
  mainBottomClass: string;
  showRegionBar: boolean;
  /** `/stores/[slug]/cart|checkout` — 헤더·주문바 고정용 뷰포트 잠금 */
  isStoreCommerceCartCheckoutPage: boolean;
  isMainColumnViewportLocked: boolean;
  /** `/stores/owner/*` 매장 오너 운영 센터 */
  isStoreOwnerAdminRoute: boolean;
};

/**
 * `ConditionalAppShell` 경로 분기 — 한 번에 계산해 렌더 본문은 선언적으로 유지한다.
 */
export function resolveConditionalAppShellFlags(
  pathname: string | null,
  regionBarInLayout: boolean
): ConditionalAppShellResolvedFlags {
  const isStoreOrderHeroMenuSurface = isStoresConsumerSlugMenuRoute(pathname);
  const topTier1RuleSet = getMobileTopTier1RuleSet(pathname);
  const isHome = pathname === "/" || pathname === "/philife";
  const isSettings = pathname?.startsWith("/my/settings") ?? false;
  const isLogout = pathname === "/my/logout";
  const isMyEdit = isProfileEditPath(pathname);
  const isProductEditPage = Boolean(pathname?.match(/^\/products\/[^/]+\/edit$/));
  const isPersonalProductComposerPage =
    pathname === "/products/new" || (pathname?.startsWith("/products/new/") ?? false) || isProductEditPage;
  const isWritePage = (pathname?.startsWith("/write") ?? false) || pathname === "/philife/write";
  const isPostDetail = Boolean(pathname?.match(/^\/post\/[^/]+$/));
  const isProductDetail = Boolean(pathname?.match(/^\/products\/[^/]+$/));
  const isStoreProductDetail = Boolean(pathname?.match(/^\/stores\/[^/]+\/p\/[^/]+$/));
  const isStoreSection = pathname === "/stores" || (pathname?.startsWith("/stores/") ?? false);
  const normalizedStorePath = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  /** 매장 오너 운영 센터 — 소비자 매장 플로우와 분리해 전역 하단 탭·본문 패딩을 허브와 동일하게 둔다. */
  const isStoreOwnerAdminRoute =
    normalizedStorePath === "/stores/owner" || normalizedStorePath.startsWith("/stores/owner/");
  /** 메인 `BottomNav` — 매장 오너 전 구간 숨김(오너 전용 하단 네비 사용) */
  const suppressBottomNavForStoreOwnerAdminSubroutes = isStoreOwnerAdminRoute;
  const isStoresHubBottomNavSurface =
    normalizedStorePath === "/stores" ||
    normalizedStorePath === "/stores/cart" ||
    normalizedStorePath === "/stores/search" ||
    normalizedStorePath.startsWith("/stores/browse/");
  /** 배달(/stores) 허브도 전역 통합 BottomNav를 쓴다. 상세·주문 플로우만 아래 별도 조건으로 숨긴다. */
  const isStoreCheckoutOrDetailFlow =
    isStoreSection && !isStoresHubBottomNavSurface && !isStoreOwnerAdminRoute;
  /** `/stores/[slug]/cart|checkout` — 헤더·주문 CTA 고정, `main` 하단 pb 0 */
  const isStoreCommerceCartCheckoutPage = isStoreCommerceCartCheckoutPath(normalizedStorePath);
  const isMainColumnViewportLocked = isStoreCommerceCartCheckoutPage;
  const isMypageTradeChatRoom = Boolean(pathname?.match(/^\/mypage\/trade\/chat\/[^/]+$/));
  const isCommunityMessengerRoom = isCommunityMessengerRoomPathname(pathname);
  const isCommunityMessengerCallPage = Boolean(pathname?.match(/^\/community-messenger\/calls\/[^/]+$/));
  const suppressIncomingCallOverlay = resolveSuppressIncomingCallOverlay(pathname);
  const isAddressMapSelect = pathname === "/address/select";
  /** 배달 탭에서 쓰는 내정보(매장/주문) 섹션 — 자체 메뉴를 가지므로 메인 하단 탭은 숨김 */
  const isDeliveryMyInfoStoreSection =
    pathname === "/mypage/section/store" || (pathname?.startsWith("/mypage/section/store/") ?? false);
  const isViewportLockedChatDetail =
    isMypageTradeChatRoom ||
    isCommunityMessengerRoom ||
    isCommunityMessengerCallPage ||
    isAddressMapSelect ||
    Boolean(
      pathname?.match(/^\/chats\/[^/]+$/) && pathname !== "/chats/new" && pathname !== "/chats/order"
    );
  const isAnyChatRoomDetail = isViewportLockedChatDetail || isCommunityMessengerCallPage;
  /**
   * 일반 뷰포트 셸 배경: `/stores/[slug]` 주문 메뉴 루트는 `ConditionalAppShell` 에서 히어로 동색 그라데이션을 준다.
   * 여기서도 `bg-sam-app` 를 붙이면 Tailwind 유틸 우선순위가 꼬여 당김 시 배경이 어긋날 수 있다.
   */
  const appShellRootViewportDefaultClass = `min-h-[100dvh] min-w-0 max-w-full overflow-x-clip${isStoreOrderHeroMenuSurface ? "" : " bg-sam-app"}`;
  const storeCartViewportLockedShellClass =
    "flex h-[100dvh] max-h-[100dvh] min-w-0 max-w-full flex-col overflow-hidden bg-sam-app";
  const appShellRootClass = isViewportLockedChatDetail
    ? topTier1RuleSet.showRegionBar
      ? "flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] min-w-0 max-w-full flex-col overflow-hidden bg-sam-app"
      : storeCartViewportLockedShellClass
    : isMainColumnViewportLocked
      ? storeCartViewportLockedShellClass
      : appShellRootViewportDefaultClass;
  const isChatRoomDetail = isAnyChatRoomDetail;
  const isSearch = pathname === "/search";
  const isServicesSection = pathname === "/services" || (pathname?.startsWith("/services/") ?? false);
  const isCommunityApp =
    pathname === "/community" ||
    (pathname?.startsWith("/community/") ?? false) ||
    pathname === "/philife" ||
    (pathname?.startsWith("/philife/") ?? false);
  const isCommunityMessengerSurface =
    pathname === "/community-messenger" || (pathname?.startsWith("/community-messenger/") ?? false);
  const isOrdersHub = pathname === "/orders" || (pathname?.startsWith("/orders/") ?? false);
  /** 거래 희망 장소 풀페이지 — 하단 탭·거래 허브 FAB 가 지도·확인 버튼을 가리지 않게 숨김 */
  const isTradeMeetSpotPickRoute = pathname === "/market/trade-meet-spot";
  const isTradeFloatingSurface = isTradeFloatingMenuSurface(pathname);
  const showHomeTradeHubFloatingBar = isTradeFloatingSurface && !isMarketTradeFeedHubPath(pathname);
  const isChatsHubSurface = pathname === "/mypage/trade/chat";
  const hideBarAndFloat = isSettings || isLogout || isMyEdit;
  const hideRegionBar = !topTier1RuleSet.showRegionBar;
  const isMyTab = pathname?.startsWith("/my") ?? false;
  const isMypageHub = pathname?.startsWith("/mypage") ?? false;
  const showFloat =
    !hideBarAndFloat &&
    !isMyTab &&
    !isMypageHub &&
    !isWritePage &&
    !isChatRoomDetail &&
    !isPostDetail &&
    !isProductDetail &&
    !isProductEditPage &&
    !isStoreProductDetail &&
    !isStoreSection &&
    !isCommunityApp &&
    !isCommunityMessengerSurface &&
    !isOrdersHub &&
    !isTradeFloatingSurface &&
    !isTradeMeetSpotPickRoute;
  /**
   * 채팅 상세에서 메인 BottomNav 숨김 — 단일 권한 (재발 방지).
   * - 방·통화·레거시 `/chats/:id` 등: `isChatRoomDetail`
   * - 메신저 허브(`/community-messenger` 목록·친구·거래채팅 필터 등): 전역 통합 `BottomNav`
   * 키보드·composer inset 과 분리. `.cursor/rules/chat-detail-bottom-nav-authority.mdc`
   */
  const suppressBottomNavForChatDetail = isChatRoomDetail;
  /** 메인 하단 탭 — 5대 허브 통합, 채팅/주문/상세 플로우 제외 */
  const showBottomNav =
    !hideBarAndFloat &&
    !isWritePage &&
    !suppressBottomNavForChatDetail &&
    !isStoreCheckoutOrDetailFlow &&
    !isPostDetail &&
    !isProductDetail &&
    !isStoreProductDetail &&
    /** `/products/new`, `/products/.../edit` — 폼 하단 고정 저장·취소와 z-index 충돌 방지(글쓰기와 동일) */
    !isPersonalProductComposerPage &&
    !isTradeMeetSpotPickRoute &&
    !suppressBottomNavForStoreOwnerAdminSubroutes;
  const showRegionBarComputed = !regionBarInLayout && !hideRegionBar;
  const showOwnerLiteStoreBar =
    showBottomNav &&
    !hideBarAndFloat &&
    !isMyTab &&
    !isMypageHub &&
    !isStoreSection &&
    !isOrdersHub &&
    !isChatRoomDetail &&
    !isChatsHubSurface &&
    !isSearch &&
    !isServicesSection &&
    !isTradeFloatingSurface &&
    !isCommunityMessengerSurface &&
    !isCommunityApp &&
    !isPersonalProductComposerPage;
  const mountGlobalRealtimeChromeOnTradeOrStoreDetail =
    isPostDetail || isProductDetail || isStoreProductDetail;
  const mountGlobalRealtimeChrome =
    !isHome &&
    (isMyTab ||
      (isStoreSection && !isStoreOwnerAdminRoute) ||
      isOrdersHub ||
      isCommunityMessengerSurface ||
      mountGlobalRealtimeChromeOnTradeOrStoreDetail) &&
    !isCommunityMessengerCallPage;
  const mountNotificationSoundPrime =
    mountGlobalRealtimeChrome || (isCommunityMessengerSurface && !isCommunityMessengerCallPage);
  const mountPhilifeWarmPrefetch =
    !isStoreOwnerAdminRoute &&
    !isCommunityApp &&
    !isCommunityMessengerSurface &&
    !isWritePage &&
    !isChatRoomDetail &&
    !isCommunityMessengerCallPage;
  const chatDetailUsesZeroBottomPadding =
    isChatRoomDetail && (!isCommunityMessengerRoom || isCommunityMessengerCallPage);
  const mainBottomClass = chatDetailUsesZeroBottomPadding
    ? "pb-0"
    : isCommunityMessengerSurface
      ? "pb-0"
      : isTradeMeetSpotPickRoute
        ? "pb-0"
      : isStoreCommerceCartCheckoutPage
        ? "pb-0"
        : showBottomNav || isPostDetail
          ? showHomeTradeHubFloatingBar
            ? MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS
            : MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS
          : "pb-4";

  return {
    isStoreOrderHeroMenuSurface,
    // home(첫 진입)에서는 글로벌 realtime chrome을 기본으로 끈다(배지/사운드는 허브에서만).
    isSettings,
    isLogout,
    isMyEdit,
    isProductEditPage,
    isPersonalProductComposerPage,
    isWritePage,
    isPostDetail,
    isProductDetail,
    isStoreProductDetail,
    isStoreSection,
    isMypageTradeChatRoom,
    isCommunityMessengerRoom,
    isCommunityMessengerCallPage,
    suppressIncomingCallOverlay,
    isAddressMapSelect,
    isViewportLockedChatDetail,
    isAnyChatRoomDetail,
    appShellRootClass,
    isChatRoomDetail,
    isSearch,
    isServicesSection,
    isCommunityApp,
    isCommunityMessengerSurface,
    isOrdersHub,
    isTradeFloatingSurface,
    showHomeTradeHubFloatingBar,
    isTradeMeetSpotPickRoute,
    isChatsHubSurface,
    hideBarAndFloat,
    hideRegionBar,
    isMyTab,
    isMypageHub,
    showFloat,
    showBottomNav,
    showOwnerLiteStoreBar,
    mountGlobalRealtimeChromeOnTradeOrStoreDetail,
    mountGlobalRealtimeChrome,
    mountNotificationSoundPrime,
    mountPhilifeWarmPrefetch,
    mainBottomClass,
    showRegionBar: showRegionBarComputed,
    isStoreCommerceCartCheckoutPage,
    isMainColumnViewportLocked: isChatRoomDetail || isMainColumnViewportLocked,
    isStoreOwnerAdminRoute,
  };
}
