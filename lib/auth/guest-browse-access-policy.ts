/**
 * 비회원 HTML/RSC 브라우징 allowlist · private URL 차단 정책.
 * `proxy.ts` 와 private 라우트 가드에서 공유한다.
 */

function isAuthEntryPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/signup" || pathname.startsWith("/signup/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname === "/terms" || pathname.startsWith("/terms/")) return true;
  if (pathname === "/privacy" || pathname.startsWith("/privacy/")) return true;
  if (pathname === "/account/delete-request" || pathname.startsWith("/account/delete-request/")) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** 로그인·약관 등 인증 플로우 전용 — 미인증 통과 */
export function isAuthFlowPublicPath(pathname: string): boolean {
  return isAuthEntryPath(pathname);
}

/** 비회원이 볼 수 있는 공개 브라우징 경로 */
export function isGuestPublicBrowsePath(pathname: string): boolean {
  if (pathname === "/") return true;

  if (pathname === "/community" || pathname.startsWith("/community/")) {
    if (pathname === "/community/my" || pathname.startsWith("/community/my/")) return false;
    if (pathname === "/community/write" || pathname.startsWith("/community/write/")) return false;
    return true;
  }

  if (pathname === "/philife" || pathname.startsWith("/philife/")) {
    if (pathname === "/philife/my" || pathname.startsWith("/philife/my/")) return false;
    if (pathname === "/philife/write" || pathname.startsWith("/philife/write/")) return false;
    return true;
  }

  if (pathname === "/market" || pathname.startsWith("/market/")) return true;
  if (pathname === "/post" || pathname.startsWith("/post/")) return true;
  if (pathname === "/products" || pathname.startsWith("/products/")) return true;

  if (pathname === "/stores" || pathname.startsWith("/stores/")) {
    if (pathname === "/stores") return true;
    if (pathname === "/stores/owner" || pathname.startsWith("/stores/owner/")) return false;
    if (pathname === "/stores/cart" || pathname.startsWith("/stores/cart/")) return true;
    if (pathname === "/stores/browse" || pathname.startsWith("/stores/browse/")) return true;
    if (pathname === "/stores/search" || pathname.startsWith("/stores/search/")) return true;
    if (/^\/stores\/[^/]+\/checkout(?:\/|$)/.test(pathname)) return true;
    if (/^\/stores\/[^/]+$/.test(pathname)) return true;
    if (/^\/stores\/[^/]+\/menu(?:\/|$)/.test(pathname)) return true;
    if (/^\/stores\/[^/]+\/p(?:\/|$)/.test(pathname)) return true;
    if (/^\/stores\/[^/]+\/info(?:\/|$)/.test(pathname)) return true;
    if (/^\/stores\/[^/]+\/reviews(?:\/|$)/.test(pathname)) return true;
    if (/^\/stores\/[^/]+\/cart(?:\/|$)/.test(pathname)) return true;
    return false;
  }

  if (pathname === "/search" || pathname.startsWith("/search/")) return true;
  if (pathname === "/services" || pathname.startsWith("/services/")) return true;
  if (pathname === "/features" || pathname.startsWith("/features/")) return true;

  if (pathname === "/mypage" || pathname.startsWith("/mypage/")) {
    if (pathname.startsWith("/mypage/store-orders")) return false;
    if (pathname === "/mypage/notifications" || pathname.startsWith("/mypage/notifications/")) return false;
    if (pathname.startsWith("/mypage/trade/chat")) return false;
    if (pathname.startsWith("/mypage/section/") && pathname.endsWith("/edit")) return false;
    if (pathname.startsWith("/mypage/business")) return false;
    return true;
  }
  if (pathname === "/my" || pathname.startsWith("/my/")) {
    if (pathname === "/my/notifications" || pathname.startsWith("/my/notifications/")) return false;
    if (pathname.includes("/trade/chat")) return false;
    if (pathname.startsWith("/my/business")) return false;
    if (pathname.includes("store-order-chat")) return false;
    return true;
  }

  if (pathname === "/community-messenger" || pathname.startsWith("/community-messenger/")) {
    if (pathname.startsWith("/community-messenger/calls/")) return false;
    return true;
  }

  return false;
}

/** 비회원 직접 진입 시 차단(로그인 링크 금지) — notFound·접근 불가 UI */
export function isAuthRequiredPrivatePath(pathname: string): boolean {
  if (pathname.startsWith("/community-messenger/calls/")) return true;
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return true;
  if (pathname === "/chats" || pathname.startsWith("/chats/")) return true;
  if (pathname === "/group-chat" || pathname.startsWith("/group-chat/")) return true;

  if (pathname === "/orders" || pathname.startsWith("/orders/")) return true;
  if (pathname.startsWith("/mypage/store-orders")) return true;
  if (pathname.includes("store-order-chat")) return true;

  if (pathname === "/stores/owner" || pathname.startsWith("/stores/owner/")) return true;
  if (pathname === "/rider" || pathname.startsWith("/rider/")) return true;
  if (isAdminPath(pathname)) return true;
  if (pathname.startsWith("/my/business")) return true;
  if (pathname.startsWith("/mypage/business")) return true;

  if (pathname.startsWith("/mypage/section/") && pathname.endsWith("/edit")) return true;
  if (pathname === "/mypage/notifications" || pathname.startsWith("/mypage/notifications/")) return true;
  if (pathname.startsWith("/mypage/trade/chat")) return true;

  if (pathname === "/my/notifications" || pathname.startsWith("/my/notifications/")) return true;
  if (pathname.includes("/trade/chat")) return true;

  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return true;
  if (pathname === "/write" || pathname.startsWith("/write/")) return true;

  return false;
}

/** proxy: 미인증 + 쿠키 없음 시 통과 허용 여부 */
export function shouldAllowUnauthenticatedHtmlRequest(pathname: string): boolean {
  return isAuthFlowPublicPath(pathname) || isGuestPublicBrowsePath(pathname);
}

/** proxy: 미인증 + 쿠키 없음 시 404 응답 대상 */
export function shouldBlockUnauthenticatedHtmlRequest(pathname: string): boolean {
  if (isAuthFlowPublicPath(pathname) || isGuestPublicBrowsePath(pathname)) return false;
  return true;
}
