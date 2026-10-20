/**
 * Main bottom-tab surface SSOT.
 *
 * Header title · BottomNav selected · exploration chrome · hub flags
 * MUST use this (or thin wrappers over it). DO NOT re-infer `/` as trade.
 *
 * CONTRACT:
 * - `/`, `/philife`, `/community`, `/home` → community (same Community home surface)
 * - Community home hub roots are decided ONLY by `isCommunityHomeSurfacePath()` /
 *   `COMMUNITY_HOME_SURFACE_PATHS` — no literal `/`·`/philife`·`/community` sets elsewhere
 *   (guarded by `community-hub-path-ssot.test.ts`).
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

  if (isCommunityHomeSurfacePath(p) || p.startsWith("/philife/") || p.startsWith("/community/")) {
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
 * Community home hub roots — single source. `/home` is the Cold Boot direct-render alias
 * (`app/(main)/home/page.tsx`, no HTTP redirect) and MUST behave exactly like `/`.
 */
export const COMMUNITY_HOME_SURFACE_PATHS = ["/", "/philife", "/community", "/home"] as const;

const COMMUNITY_HOME_SURFACE_PATH_SET: ReadonlySet<string> = new Set(COMMUNITY_HOME_SURFACE_PATHS);

/**
 * Community home hubs that share one surface authority
 * (`CommunityHomeSurface` / `PhilifeHomeFeedPage`).
 * Detail routes under `/philife/*` · `/community/*` are community surface but not the home hub.
 */
export function isCommunityHomeSurfacePath(pathname: string | null | undefined): boolean {
  return COMMUNITY_HOME_SURFACE_PATH_SET.has(pathOnly(pathname));
}

/** Bottom-tab hub ids kept alive under Main App Shell (exact hubs only — not detail routes). */
export type MainTabKeepAliveHubId = "community" | "trade" | "delivery" | "chat" | "mypage";

/**
 * Exact bottom-tab hub paths that share one keep-alive Surface instance.
 * Detail routes (`/philife/post/…`, `/market/jobs`, `/community-messenger/rooms/…`) are NOT hubs.
 */
export function resolveMainTabKeepAliveHub(
  pathname: string | null | undefined
): MainTabKeepAliveHubId | null {
  const p = pathOnly(pathname);
  if (isCommunityHomeSurfacePath(p)) return "community";
  if (p === "/market") return "trade";
  if (p === "/stores") return "delivery";
  if (p === "/community-messenger") return "chat";
  if (p === "/mypage" || p === "/my") return "mypage";
  return null;
}

export function isMainTabKeepAliveHubPath(pathname: string | null | undefined): boolean {
  return resolveMainTabKeepAliveHub(pathname) != null;
}

export function isCommunityMainSurface(pathname: string | null | undefined): boolean {
  return resolveMainSurface(pathname) === "community";
}

export function isTradeMainSurface(pathname: string | null | undefined): boolean {
  return resolveMainSurface(pathname) === "trade";
}
