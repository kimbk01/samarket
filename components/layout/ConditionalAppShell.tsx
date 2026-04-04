"use client";

import { usePathname } from "next/navigation";
import {
  MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS,
  MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { HomeTradeHubFloatingBar } from "@/components/home/HomeTradeHubFloatingBar";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import {
  getMobileTopTier1RuleSet,
  isTradeFloatingMenuSurface,
} from "@/lib/layout/mobile-top-tier1-rules";
import { RegionBar } from "./RegionBar";
import { BottomNav } from "./BottomNav";
import { FloatingAddButton } from "./FloatingAddButton";
import { OwnerLiteStoreBar } from "./OwnerLiteStoreBar";
import { GlobalOrderChatUnreadSound } from "@/components/notifications/GlobalOrderChatUnreadSound";
import { NotificationSoundPrime } from "@/components/notifications/NotificationSoundPrime";
import { NotificationsBadgeRealtimeBridge } from "@/components/notifications/NotificationsBadgeRealtimeBridge";
import { HomeTradeReelsSideRail } from "@/components/home-feed/HomeTradeReelsSideRail";
import { PhilifeFeedWarmPrefetch } from "@/components/community/PhilifeFeedWarmPrefetch";
import { GlobalCommunityMessengerIncomingCall } from "@/components/community-messenger/GlobalCommunityMessengerIncomingCall";
import { GlobalCommunityMessengerUnreadSound } from "@/components/community-messenger/GlobalCommunityMessengerUnreadSound";

export function ConditionalAppShell({
  children,
  regionBarInLayout = false,
}: {
  children: React.ReactNode;
  /** true면 **메인 1단**(`RegionBar`)는 `AppStickyHeader`에서만 렌더 — 여기서 중복 삽입 안 함 (`lib/layout/main-tier1.ts`) */
  regionBarInLayout?: boolean;
}) {
  const pathname = usePathname();
  const topTier1RuleSet = getMobileTopTier1RuleSet(pathname);
  const isSettings = pathname?.startsWith("/my/settings") ?? false;
  const isLogout = pathname === "/my/logout";
  const isMyEdit = pathname === "/my/edit";
  const isProductEditPage = pathname?.match(/^\/products\/[^/]+\/edit$/) ?? false;
  /** 개인거래 상품 등록·수정 — 하단 탭은 유지하되 매장 단축 바(OwnerLiteStoreBar)는 노출하지 않음 */
  const isPersonalProductComposerPage =
    pathname === "/products/new" || (pathname?.startsWith("/products/new/") ?? false) || isProductEditPage;
  const isWritePage =
    (pathname?.startsWith("/write") ?? false) || pathname === "/philife/write";
  const isPostDetail = pathname?.match(/^\/post\/[^/]+$/) ?? false;
  const isProductDetail = pathname?.match(/^\/products\/[^/]+$/) ?? false;
  const isStoreProductDetail = pathname?.match(/^\/stores\/[^/]+\/p\/[^/]+$/) ?? false;
  /** 매장 탭·매장 하위에서는 글쓰기 FAB 숨김 */
  const isStoreSection = pathname === "/stores" || (pathname?.startsWith("/stores/") ?? false);
  /** 거래 허브 안 채팅방 상세 — 메시지 영역만 스크롤되게 뷰포트 높이 고정. 목록·구매·판매 등은 문서 스크롤 */
  const isMypageTradeChatRoom = pathname?.match(/^\/mypage\/trade\/chat\/[^/]+$/) ?? false;
  const isCommunityMessengerRoom = pathname?.match(/^\/community-messenger\/rooms\/[^/]+$/) ?? false;
  /**
   * 거래 채팅방: AppStickyHeader(1단)은 플로우 상단에 따로 있으므로,
   * 본 셸 높이에서만 1단·상단 safe-area 를 빼면 `1단 + 본문` 이 뷰포트에 맞는다.
   * 하단 메인 탭은 fixed 이므로 여기서 높이에서 빼지 않음(`trade` 레이아웃 `pb-24` 로 여백).
   */
  const isAnyChatRoomDetail =
    isMypageTradeChatRoom ||
    isCommunityMessengerRoom ||
    ((pathname?.match(/^\/chats\/[^/]+$/) &&
      pathname !== "/chats/new" &&
      pathname !== "/chats/order") ??
      false);
  const appShellRootClass = isAnyChatRoomDetail
    ? topTier1RuleSet.showRegionBar
      ? "flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] min-w-0 max-w-full flex-col overflow-hidden bg-[#F7F7F7]"
      : "flex h-[100dvh] max-h-[100dvh] min-w-0 max-w-full flex-col overflow-hidden bg-[#F7F7F7]"
    : "min-h-screen min-w-0 max-w-full overflow-x-clip bg-[#F7F7F7]";
  const isChatRoomDetail = isAnyChatRoomDetail;
  const isSearch = pathname === "/search";
  const isServicesSection = pathname === "/services" || (pathname?.startsWith("/services/") ?? false);
  /** 필라이프 피드는 전용 FAB·시트 사용 */
  const isCommunityApp =
    pathname === "/community" ||
    (pathname?.startsWith("/community/") ?? false) ||
    pathname === "/philife" ||
    (pathname?.startsWith("/philife/") ?? false);
  const isCommunityMessengerSurface =
    pathname === "/community-messenger" || (pathname?.startsWith("/community-messenger/") ?? false);
  const isOrdersHub = pathname === "/orders" || (pathname?.startsWith("/orders/") ?? false);
  /** TRADE 탐색(/home·/market/카테고리) + 홈 개인거래 숏컷 — 동일 플로팅 다이얼·스크롤 패딩 */
  const isTradeFloatingSurface = isTradeFloatingMenuSurface(pathname);
  /** 채팅 목록 허브 — 상단 매장 단축 바가 스티키와 겹쳐 보이지 않게 제외 */
  const isChatsHubSurface =
    pathname === "/mypage/trade/chat";
  const hideBarAndFloat = isSettings || isLogout || isMyEdit;
  /** 모바일 메인 1단은 탐색형 화면에서만 유지 */
  const hideRegionBar = !topTier1RuleSet.showRegionBar;
  const isMyTab = pathname?.startsWith("/my") ?? false;
  /** 내정보 `/mypage/*`(거래 허브 등) — 플로팅 글쓰기·우측 레일 없이 사이드/목록 UX */
  const isMypageHub = pathname?.startsWith("/mypage") ?? false;
  /** 당근형: 거래 물품 상세(`/post/*`, `/products/*`)는 하단 CTA·우측 허브만 — 레거시 좌하단 글쓰기 FAB 숨김 */
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
  /** 거래 채팅방 상세에서도 하단 메인 탭 유지(당근형) */
  const showBottomNav =
    !hideBarAndFloat &&
    !isWritePage &&
    !isChatRoomDetail &&
    !isPostDetail &&
    !isProductDetail &&
    !isStoreProductDetail;

  const showRegionBar = !regionBarInLayout && !hideRegionBar;
  /**
   * 거래(Trade) 탐색·피드는 매장과 무관 — 매장 단축 바는 Stores/주문 등에서만 노출.
   * 필라이프/커뮤니티 화면에서는 매장 진입 UI를 두지 않음.
   */
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
  const mountGlobalRealtimeChrome =
    showBottomNav || isMyTab || isStoreSection || isOrdersHub;

  const mainBottomClass =
    showBottomNav || isPostDetail
      ? isChatRoomDetail
        ? "pb-0"
        : isTradeFloatingSurface
          ? MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS
          : MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS
      : "pb-4";

  return (
    <div className={appShellRootClass}>
      <PhilifeFeedWarmPrefetch />
      {mountGlobalRealtimeChrome ? <NotificationSoundPrime /> : null}
      {mountGlobalRealtimeChrome ? <NotificationsBadgeRealtimeBridge /> : null}
      {mountGlobalRealtimeChrome ? <GlobalOrderChatUnreadSound /> : null}
      <GlobalCommunityMessengerUnreadSound />
      <GlobalCommunityMessengerIncomingCall />
      {showRegionBar && <RegionBar />}
      {showOwnerLiteStoreBar ? <OwnerLiteStoreBar /> : null}
      <main
        className={`${mainBottomClass} min-w-0 overflow-x-hidden ${
          isChatRoomDetail
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-hidden"
            : ""
        }`}
      >
        <div
          className={`${APP_MAIN_COLUMN_CLASS}${
            isChatRoomDetail
              ? " flex min-h-0 min-w-0 flex-1 flex-col"
              : ""
          }`}
        >
          {children}
        </div>
      </main>
      {showBottomNav && <BottomNav />}
      {showBottomNav && isTradeFloatingSurface ? <HomeTradeHubFloatingBar /> : null}
      {showFloat && <FloatingAddButton />}
      <HomeTradeReelsSideRail />
    </div>
  );
}
