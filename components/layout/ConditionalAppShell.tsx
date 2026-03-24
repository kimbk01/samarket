"use client";

import { usePathname } from "next/navigation";
import { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { RegionBar } from "./RegionBar";
import { BottomNav } from "./BottomNav";
import { FloatingAddButton } from "./FloatingAddButton";
import { GlobalOrderChatUnreadSound } from "@/components/notifications/GlobalOrderChatUnreadSound";
import { NotificationSoundPrime } from "@/components/notifications/NotificationSoundPrime";
import { NotificationsBadgeRealtimeBridge } from "@/components/notifications/NotificationsBadgeRealtimeBridge";

export function ConditionalAppShell({
  children,
  regionBarInLayout = false,
}: {
  children: React.ReactNode;
  /** true면 RegionBar는 레이아웃(AppStickyHeader)에서 렌더하므로 여기선 제외 */
  regionBarInLayout?: boolean;
}) {
  const pathname = usePathname();
  const isSettings = pathname?.startsWith("/my/settings") ?? false;
  const isLogout = pathname === "/my/logout";
  const isMyEdit = pathname === "/my/edit";
  const isWritePage = pathname?.startsWith("/write") ?? false;
  const isPostDetail = pathname?.match(/^\/post\/[^/]+$/) ?? false;
  const isProductDetail = pathname?.match(/^\/products\/[^/]+$/) ?? false;
  const isStoreProductDetail = pathname?.match(/^\/stores\/[^/]+\/p\/[^/]+$/) ?? false;
  /** 매장 탭·매장 하위에서는 글쓰기 FAB 숨김 */
  const isStoreSection = pathname === "/stores" || (pathname?.startsWith("/stores/") ?? false);
  const isChatRoomDetail =
    (pathname?.match(/^\/chats\/[^/]+$/) &&
      pathname !== "/chats/new" &&
      pathname !== "/chats/order") ??
    false;
  const isSearch = pathname === "/search";
  /** 동네생활 피드는 전용 FAB·시트 사용 */
  const isCommunityApp =
    pathname === "/community" || (pathname?.startsWith("/community/") ?? false);
  const isOrdersHub = pathname === "/orders" || (pathname?.startsWith("/orders/") ?? false);
  const hideBarAndFloat = isSettings || isLogout || isMyEdit;
  /** 당근형: 상품 상세·채팅방·검색·주문 허브는 전용 헤더만 사용, RegionBar 숨김 */
  const hideRegionBar =
    hideBarAndFloat ||
    isProductDetail ||
    isStoreProductDetail ||
    isChatRoomDetail ||
    isSearch ||
    isOrdersHub;
  const isMyTab = pathname?.startsWith("/my") ?? false;
  /** 당근형: 상품 상세는 하단 CTA만, 플로팅 글쓰기 숨김 */
  const showFloat =
    !hideBarAndFloat &&
    !isMyTab &&
    !isWritePage &&
    !isChatRoomDetail &&
    !isProductDetail &&
    !isStoreProductDetail &&
    !isStoreSection &&
    !isCommunityApp &&
    !isOrdersHub;
  /** 거래 채팅방 상세에서도 하단 메인 탭 유지(당근형) */
  const showBottomNav =
    !hideBarAndFloat &&
    !isWritePage &&
    !isPostDetail &&
    !isProductDetail &&
    !isStoreProductDetail;

  const showRegionBar = !regionBarInLayout && !hideRegionBar;

  const mainBottomClass =
    showBottomNav || isPostDetail
      ? isChatRoomDetail
        ? "pb-0"
        : MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS
      : "pb-4";

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <NotificationSoundPrime />
      <NotificationsBadgeRealtimeBridge />
      <GlobalOrderChatUnreadSound />
      {showRegionBar && <RegionBar />}
      <main className={`${mainBottomClass} min-w-0 overflow-x-hidden`}>
        <div className={APP_MAIN_COLUMN_CLASS}>{children}</div>
      </main>
      {showBottomNav && <BottomNav />}
      {showFloat && <FloatingAddButton />}
    </div>
  );
}
