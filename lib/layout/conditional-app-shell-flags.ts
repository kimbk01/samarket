import {
  MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS,
  MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import {
  getMobileTopTier1RuleSet,
  isTradeFloatingMenuSurface,
} from "@/lib/layout/mobile-top-tier1-rules";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";

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
};

/**
 * `ConditionalAppShell` 경로 분기 — 한 번에 계산해 렌더 본문은 선언적으로 유지한다.
 */
export function resolveConditionalAppShellFlags(
  pathname: string | null,
  regionBarInLayout: boolean
): ConditionalAppShellResolvedFlags {
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
  const isMypageTradeChatRoom = Boolean(pathname?.match(/^\/mypage\/trade\/chat\/[^/]+$/));
  const isCommunityMessengerRoom = isCommunityMessengerRoomPathname(pathname);
  const isCommunityMessengerCallPage = Boolean(pathname?.match(/^\/community-messenger\/calls\/[^/]+$/));
  const suppressIncomingCallOverlay = resolveSuppressIncomingCallOverlay(pathname);
  const isAddressMapSelect = pathname === "/address/select";
  const isViewportLockedChatDetail =
    isMypageTradeChatRoom ||
    isCommunityMessengerRoom ||
    isCommunityMessengerCallPage ||
    isAddressMapSelect ||
    Boolean(
      pathname?.match(/^\/chats\/[^/]+$/) && pathname !== "/chats/new" && pathname !== "/chats/order"
    );
  const isAnyChatRoomDetail = isViewportLockedChatDetail || isCommunityMessengerCallPage;
  const appShellRootClass = isViewportLockedChatDetail
    ? topTier1RuleSet.showRegionBar
      ? "flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] min-w-0 max-w-full flex-col overflow-hidden bg-sam-app"
      : "flex h-[100dvh] max-h-[100dvh] min-w-0 max-w-full flex-col overflow-hidden bg-sam-app"
    : "min-h-[100dvh] min-w-0 max-w-full overflow-x-clip bg-sam-app";
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
  /** 메신저 채팅방은 하단 탭 유지 — 기타 채팅 상세·통화 전용은 숨김 */
  const suppressBottomNavForChatDetail = isChatRoomDetail && !isCommunityMessengerRoom;
  /**
   * 메신저(`community-messenger`)도 메인 하단 탭을 유지한다.
   * 통화 전용·비메신저 채팅 상세만 별도 억제 규칙을 따른다.
   */
  const showBottomNav =
    !hideBarAndFloat &&
    !isWritePage &&
    !suppressBottomNavForChatDetail &&
    !isPostDetail &&
    !isProductDetail &&
    !isStoreProductDetail &&
    /** `/products/new`, `/products/.../edit` — 폼 하단 고정 저장·취소와 z-index 충돌 방지(글쓰기와 동일) */
    !isPersonalProductComposerPage &&
    !isTradeMeetSpotPickRoute;
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
      isStoreSection ||
      isOrdersHub ||
      isCommunityMessengerSurface ||
      mountGlobalRealtimeChromeOnTradeOrStoreDetail) &&
    !isCommunityMessengerCallPage;
  const mountNotificationSoundPrime =
    mountGlobalRealtimeChrome || (isCommunityMessengerSurface && !isCommunityMessengerCallPage);
  const mountPhilifeWarmPrefetch =
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
        : showBottomNav || isPostDetail
          ? showHomeTradeHubFloatingBar
            ? MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS
            : MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS
          : "pb-4";

  return {
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
  };
}
