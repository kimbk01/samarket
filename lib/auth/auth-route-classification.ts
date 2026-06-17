/**
 * 계정 의존 라우트·로그인 landing denylist — proxy·safe-next·클라 가드 공유.
 */

const AUTH_ENTRY_PREFIXES = ["/login", "/signup", "/auth/"] as const;

/** 신규 로그인·계정 전환 후 deep link 복원 금지 */
const FRESH_LOGIN_DENIED_PREFIXES = [
  "/community-messenger/rooms/",
  "/community-messenger/calls/",
  "/chats/",
  "/group-chat/",
  "/orders/store/",
  "/mypage/store-orders/",
  "/stores/owner/orders/",
  "/mypage/trade/chat/",
  "/post/",
  "/products/",
] as const;

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return "/";
  const qIdx = trimmed.indexOf("?");
  const base = qIdx >= 0 ? trimmed.slice(0, qIdx) : trimmed;
  return base.replace(/\/+$/, "") || "/";
}

export function isAuthEntryPath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  for (const prefix of AUTH_ENTRY_PREFIXES) {
    if (p === prefix.slice(0, -1) || p.startsWith(prefix)) return true;
  }
  if (p === "/terms" || p.startsWith("/terms/")) return true;
  if (p === "/privacy" || p.startsWith("/privacy/")) return true;
  return false;
}

export function isAccountDependentPath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  if (p.startsWith("/community-messenger/rooms/")) return true;
  if (p.startsWith("/community-messenger/calls/")) return true;
  if (p === "/chat" || p.startsWith("/chat/")) return true;
  if (p === "/chats" || p.startsWith("/chats/")) return true;
  if (p === "/group-chat" || p.startsWith("/group-chat/")) return true;
  if (p === "/orders" || p.startsWith("/orders/")) return true;
  if (p.startsWith("/mypage/store-orders")) return true;
  if (p.includes("store-order-chat")) return true;
  if (p === "/stores/owner" || p.startsWith("/stores/owner/")) return true;
  if (p === "/rider" || p.startsWith("/rider/")) return true;
  if (p === "/admin" || p.startsWith("/admin/")) return true;
  if (p.startsWith("/my/business")) return true;
  if (p.startsWith("/mypage/business")) return true;
  if (p.startsWith("/mypage/section/") && p.endsWith("/edit")) return true;
  if (p === "/mypage/notifications" || p.startsWith("/mypage/notifications/")) return true;
  if (p.startsWith("/mypage/trade/chat")) return true;
  if (p === "/my/notifications" || p.startsWith("/my/notifications/")) return true;
  if (p.includes("/trade/chat")) return true;
  if (p === "/onboarding" || p.startsWith("/onboarding/")) return true;
  if (p === "/write" || p.startsWith("/write/")) return true;
  if (p.startsWith("/profile/")) return true;
  return false;
}

export function shouldDenyFreshLoginLanding(pathWithOptionalSearch: string): boolean {
  const pathname = normalizePathname(pathWithOptionalSearch);
  for (const prefix of FRESH_LOGIN_DENIED_PREFIXES) {
    if (pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/** 로그인 `next` 파라미터 — account-dependent 경로는 저장·복원 금지 */
export function sanitizeLoginNextPath(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || !raw.startsWith("/")) return null;
  const pathname = normalizePathname(raw);
  if (isAccountDependentPath(pathname)) return null;
  if (isAuthEntryPath(pathname)) return null;
  return raw;
}

export { FRESH_LOGIN_DENIED_PREFIXES };
