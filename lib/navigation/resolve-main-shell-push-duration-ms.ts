"use client";

import {
  MAIN_SHELL_ROUTE_TRANSITION_MS,
  TRADE_MARKET_CACHE_HIT_PUSH_MS,
  normalizePathForRouteTransition,
} from "@/components/route-transition/route-transition-config";
import type { MenuNavigationIntent } from "@/contexts/LatestMenuNavigationContext";
import { peekCachedPostsForHome } from "@/lib/posts/getPostsForHome";

export function resolveMainShellPushDurationMs(
  intent: MenuNavigationIntent | null | undefined,
  targetPath: string | null | undefined,
  opts: { reducedMotion?: boolean } = {}
): number {
  if (opts.reducedMotion) return MAIN_SHELL_ROUTE_TRANSITION_MS;
  if (!intent || intent.mainShellCrossGroupPush) return MAIN_SHELL_ROUTE_TRANSITION_MS;
  if (intent.source !== "bottom-nav" && intent.source !== "trade-primary") {
    return MAIN_SHELL_ROUTE_TRANSITION_MS;
  }
  const path = normalizePathForRouteTransition(targetPath ?? intent.pathname);
  if (path !== "/market") return MAIN_SHELL_ROUTE_TRANSITION_MS;
  const hit = peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
  if (hit?.posts?.length) return TRADE_MARKET_CACHE_HIT_PUSH_MS;
  return MAIN_SHELL_ROUTE_TRANSITION_MS;
}
