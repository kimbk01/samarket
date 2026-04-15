import {
  MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS,
  MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import {
  getMobileTopTier1RuleSet,
  isTradeFloatingMenuSurface,
} from "@/lib/layout/mobile-top-tier1-rules";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";

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
  const isCommunityMessengerRoom = Boolean(pathname?.match(/^\/community-messenger\/rooms\/[^/]+$/));
  const isCommunityMessengerCallPage = Boolean(pathname?.match(/^\/community-messenger\/calls\/[^/]+$/));
  const suppressIncomingCallOverlay =
    Boolean(pathname?.match(/^\/community-messenger\/calls\/[^/]+$/)) &&
    pathname !== "/community-messenger/calls/outgoing";
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
      ? "flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] min-w-0 max-w-full flex-col overflow-hidden bg-[#F7F7F7]"
      : "flex h-[100dvh] max-h-[100dvh] min-w-0 max-w-full flex-col overflow-hidden bg-[#F7F7F7]"
    : "min-h-screen min-w-0 max-w-full overflow-x-clip bg-[#F7F7F7]";
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
  const isTradeFloatingSurface = isTradeFloatingMenuSurface(pathname);
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
    !isTradeFloatingSurface;
  const showBottomNav =
    !hideBarAndFloat &&
    !isWritePage &&
    !isChatRoomDetail &&
    !isPostDetail &&
    !isProductDetail &&
    !isStoreProductDetail;
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
    (showBottomNav ||
      isMyTab ||
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
  const mainBottomClass = isChatRoomDetail
    ? "pb-0"
    : showBottomNav || isPostDetail
      ? isTradeFloatingSurface
        ? MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS
        : MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS
      : "pb-4";

  return {
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
