"use client";

import { usePathname } from "next/navigation";
import { CategoryListSubheader } from "@/components/category/CategoryListSubheader";
import { useCategoryListStickyConfig } from "@/contexts/CategoryListHeaderContext";
import { RegionBar } from "./RegionBar";

/** 거래 1단(RegionBar → TradePrimaryAppBarShell) 상단 고정 — 테스트 로그인은 내정보(/my)에서만 */
export function AppStickyHeader() {
  const pathname = usePathname();
  const categorySticky = useCategoryListStickyConfig();
  const isSettings = pathname?.startsWith("/my/settings") ?? false;
  const isLogout = pathname === "/my/logout";
  const isMyEdit = pathname === "/my/edit";
  const isProductDetail = pathname?.match(/^\/products\/[^/]+$/) ?? false;
  const isChatRoomDetail =
    (pathname?.match(/^\/chats\/[^/]+$/) &&
      pathname !== "/chats/new" &&
      pathname !== "/chats/order") ??
    false;
  const isSearch = pathname === "/search";
  /** 매장 탭/매장 상세는 거래용 상단 동네 바(RegionBar) 미사용 */
  const isStoresSection = pathname?.startsWith("/stores") ?? false;
  /** 매장 관리자(내 상점) 구간은 서브 헤더만 — 글로벌 1단(지역·검색·알림) 숨김 */
  const isMyBusinessSection = pathname?.startsWith("/my/business") ?? false;
  /** 동네생활 게시글 읽기 — 화면 전용 헤더만, 글로벌 1단 숨김 */
  const isCommunityPostDetail = pathname?.match(/^\/community\/post\/[^/]+$/) ?? false;
  /** 채팅 허브 — 전용 앱바(`ChatsHubStickyAppBar`)로 대체, 글로벌 RegionBar 숨김 */
  const isChatsHub = pathname === "/chats";
  /** 주문 허브 — 전용 앱바(`TradePrimaryColumnStickyAppBar`), 글로벌 RegionBar 숨김 */
  const isOrdersHub = pathname === "/orders" || (pathname?.startsWith("/orders/") ?? false);
  const hideBarAndFloat = isSettings || isLogout || isMyEdit;
  const hideRegionBar =
    hideBarAndFloat ||
    isProductDetail ||
    isChatRoomDetail ||
    isSearch ||
    isStoresSection ||
    isMyBusinessSection ||
    isCommunityPostDetail ||
    isChatsHub ||
    isOrdersHub;

  return (
    <div className="sticky top-0 z-20">
      {!hideRegionBar &&
        (categorySticky ? (
          <div className="border-b border-gray-200 bg-white">
            <RegionBar embedded />
            <CategoryListSubheader
              backHref={categorySticky.backHref}
              category={categorySticky.category}
              showTypeBadge={categorySticky.showTypeBadge}
            />
          </div>
        ) : (
          <RegionBar />
        ))}
    </div>
  );
}
