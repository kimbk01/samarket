/**
 * Main bottom-tab surface SSOT.
 *
 * Header title · BottomNav selected · exploration chrome · hub flags
 * MUST use this (or thin wrappers over it). DO NOT re-infer `/` as trade.
 *
 * CONTRACT:
 * - `/`, `/philife`, `/community` → community (same Community home surface)
 * - `/community-messenger` is chat (never match as `/community` prefix)
 */
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";

export type MainSurfaceId = "community" | "trade" | "delivery" | "chat" | "mypage" | "other";

function pathOnly(pathname: string | null | undefined): string {
  return normalizeAppPathnameForTier1(pathname);
}

/**
 * Canonical main surface for shell chrome + bottom-nav identity.
 */
export function resolveMainSurface(pathname: string | null | undefined): MainSurfaceId {
  const p = pathOnly(pathname);

  if (p === "/community-messenger" || p.startsWith("/community-messenger/")) return "chat";
  if (p === "/chats" || p.startsWith("/chats/") || p === "/chat" || p.startsWith("/chat/")) return "chat";

  if (
    p === "/" ||
    p === "/philife" ||
    p.startsWith("/philife/") ||
    p === "/community" ||
    p.startsWith("/community/")
  ) {
    return "community";
  }

  if (
    p === "/market" ||
    p.startsWith("/market/") ||
    p.startsWith("/post/") ||
    p.startsWith("/products/") ||
    p === "/write" ||
    p.startsWith("/write/") ||
    p === "/shop" ||
    p.startsWith("/shop/")
  ) {
    return "trade";
  }

  if (p === "/stores" || p.startsWith("/stores/") || p === "/orders" || p.startsWith("/orders/")) {
    return "delivery";
  }

  if (p === "/mypage" || p.startsWith("/mypage/") || p === "/my" || p.startsWith("/my/")) {
    return "mypage";
  }

  return "other";
}

/**
 * Community home hubs that share one surface authority
 * (`CommunityHomeSurface` / `PhilifeHomeFeedPage`).
 * Detail routes under `/philife/*` · `/community/*` are community surface but not the home hub.
 */
export function isCommunityHomeSurfacePath(pathname: string | null | undefined): boolean {
  const p = pathOnly(pathname);
  return p === "/" || p === "/philife" || p === "/community";
}

export function isCommunityMainSurface(pathname: string | null | undefined): boolean {
  return resolveMainSurface(pathname) === "community";
}

export function isTradeMainSurface(pathname: string | null | undefined): boolean {
  return resolveMainSurface(pathname) === "trade";
}
