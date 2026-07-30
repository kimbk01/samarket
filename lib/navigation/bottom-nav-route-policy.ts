import { isMypageAddressFlowPath } from "@/lib/addresses/mypage-addresses-return-to";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import { isStoreCommerceCartCheckoutPath } from "@/lib/stores/store-cart-page-layout";
import {
  isDeliveryConsumerBottomNavSurface,
  isStoreOrderReviewPath,
} from "@/lib/main-menu/delivery-bottom-nav-layout";

export type BottomNavSuppressionInput = {
  pathname: string;
  isWriteSheetOpen?: boolean;
  isMessengerStackSurface?: boolean;
  headerMessengerFromPhilife?: boolean;
  storeOwnerFlyoutSuppressesBottomNav?: boolean;
  messengerCallSuppressesBottomNav?: boolean;
  /** 768px+ 메신저 split — room route 에서도 BottomNav 유지 */
  messengerSplitViewport?: boolean;
};

export type BottomNavRouteOptions = {
  messengerSplitViewport?: boolean;
};

function normalizeBottomNavPathname(pathname: string | null | undefined): string {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
  return p;
}

function isCommunityMessengerRoomPath(pathname: string): boolean {
  return /^\/community-messenger\/rooms\/[^/]+$/.test(pathname);
}

function isCommunityMessengerCallPath(pathname: string): boolean {
  return /^\/community-messenger\/calls\/[^/]+$/.test(pathname);
}

function isLegacyChatDetailPath(pathname: string): boolean {
  if (pathname === "/chats/new" || pathname === "/chats/order") return false;
  return /^\/chats\/[^/]+$/.test(pathname);
}

function isMypageTradeChatRoomPath(pathname: string): boolean {
  return /^\/mypage\/trade\/chat\/[^/]+$/.test(pathname);
}

function isStoreOwnerAdminPath(pathname: string): boolean {
  return pathname === "/stores/owner" || pathname.startsWith("/stores/owner/");
}

function isLegacyBusinessAdminPath(pathname: string): boolean {
  return pathname === "/mypage/business" ||
    pathname.startsWith("/mypage/business/") ||
    pathname === "/my/business" ||
    pathname.startsWith("/my/business/");
}

function isWritePath(pathname: string): boolean {
  return pathname === "/philife/write" || pathname === "/write" || pathname.startsWith("/write/");
}

function isPostOrProductDetailPath(pathname: string): boolean {
  return /^\/post\/[^/]+$/.test(pathname) ||
    /^\/products\/[^/]+$/.test(pathname) ||
    /^\/stores\/[^/]+\/p\/[^/]+$/.test(pathname);
}

function isPersonalProductComposerPath(pathname: string): boolean {
  return pathname === "/products/new" ||
    pathname.startsWith("/products/new/") ||
    /^\/products\/[^/]+\/edit$/.test(pathname);
}

function isStoreCheckoutOrDetailFlow(pathname: string): boolean {
  if (pathname !== "/stores" && !pathname.startsWith("/stores/")) return false;
  if (isStoreOwnerAdminPath(pathname)) return false;
  if (isDeliveryConsumerBottomNavSurface(pathname)) return false;
  return true;
}

/**
 * Main bottom nav route contract.
 * `messengerSplitViewport`: 768+ **AND landscape** split room — room path 도 eligible.
 * BottomNav 폭은 `app-bottom-nav-shell--messenger-split-list` 로 좌측 pane 만 (전폭 금지).
 */
export function isBottomNavEligibleRoute(
  pathname: string,
  options?: BottomNavRouteOptions
): boolean {
  const p = normalizeBottomNavPathname(pathname);
  if (p === "/") return true;
  if (p === "/my/logout" || p.startsWith("/my/settings") || isProfileEditPath(p)) return false;
  if (isWritePath(p) || isPersonalProductComposerPath(p)) return false;
  if (isCommunityMessengerRoomPath(p)) {
    return Boolean(options?.messengerSplitViewport);
  }
  if (
    isCommunityMessengerCallPath(p) ||
    isLegacyChatDetailPath(p) ||
    isMypageTradeChatRoomPath(p)
  ) {
    return false;
  }
  if (isLegacyBusinessAdminPath(p) || isStoreOwnerAdminPath(p)) return false;
  if (isStoreCheckoutOrDetailFlow(p)) return false;
  if (isStoreCommerceCartCheckoutPath(p) || isStoreOrderReviewPath(p) || isMypageAddressFlowPath(p)) return false;
  if (isPostOrProductDetailPath(p)) return false;
  if (p === "/orders" || p.startsWith("/orders/")) return false;
  if (p === "/market/trade-meet-spot") return false;
  return true;
}

export function shouldRenderMainBottomNav(input: BottomNavSuppressionInput): boolean {
  if (
    !isBottomNavEligibleRoute(input.pathname, {
      messengerSplitViewport: input.messengerSplitViewport,
    })
  ) {
    return false;
  }
  if (input.isWriteSheetOpen) return false;
  if (input.isMessengerStackSurface && input.headerMessengerFromPhilife) return false;
  if (input.storeOwnerFlyoutSuppressesBottomNav) return false;
  if (input.messengerCallSuppressesBottomNav) return false;
  return true;
}
